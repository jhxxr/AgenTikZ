use agent_client_protocol::v1::schema::{EnvVariable, McpServer, McpServerStdio};
use axum::{
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex, Weak,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tokio::{net::TcpListener, sync::oneshot, task::JoinHandle};

type Dispatcher = dyn Fn(ToolRequest) -> Result<(), String> + Send + Sync;
static ACTIVE: LazyLock<Mutex<HashMap<String, Weak<BridgeContext>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CanvasTarget {
    pub conversation_id: String,
    pub project_id: String,
    pub canvas_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolRequest {
    pub request_id: String,
    pub tool_request_id: String,
    pub target: CanvasTarget,
    pub tool_name: String,
    pub arguments: Value,
}

pub struct BridgeContext {
    request_id: String,
    window_label: String,
    target: CanvasTarget,
    token: String,
    active: AtomicBool,
    proposal_created: AtomicBool,
    pending: Mutex<HashMap<String, oneshot::Sender<Value>>>,
    dispatch: Arc<Dispatcher>,
}

pub struct BridgeLease {
    context: Arc<BridgeContext>,
    task: JoinHandle<()>,
    pub endpoint: String,
}

impl Drop for BridgeLease {
    fn drop(&mut self) {
        self.context.revoke();
        self.task.abort();
        if let Ok(mut active) = ACTIVE.lock() {
            active.remove(&self.context.request_id);
        }
    }
}

impl BridgeContext {
    fn revoke(&self) {
        self.active.store(false, Ordering::SeqCst);
        if let Ok(mut pending) = self.pending.lock() {
            for (_, sender) in pending.drain() {
                let _ = sender.send(json!({"error":{"code":"request_ended"}}));
            }
        }
    }
    fn complete(&self, id: &str, value: Value) -> Result<(), String> {
        let sender = self
            .pending
            .lock()
            .map_err(|_| "MCP 请求锁不可用。")?
            .remove(id)
            .ok_or("MCP 工具请求已过期。")?;
        if value.get("proposalId").is_some_and(Value::is_string)
            && value.get("status").and_then(Value::as_str) == Some("pending")
            && value.get("applied").and_then(Value::as_bool) == Some(false)
        {
            self.proposal_created.store(true, Ordering::SeqCst);
        }
        sender
            .send(value)
            .map_err(|_| "MCP 工具请求已取消。".into())
    }
}

pub fn revoke_all() {
    if let Ok(active) = ACTIVE.lock() {
        for context in active.values().filter_map(Weak::upgrade) {
            context.revoke();
        }
    }
}

pub fn revoke_window(label: &str) {
    if let Ok(active) = ACTIVE.lock() {
        for context in active
            .values()
            .filter_map(Weak::upgrade)
            .filter(|ctx| ctx.window_label == label)
        {
            context.revoke();
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Call {
    tool_name: String,
    arguments: Value,
}

struct PendingGuard {
    context: Arc<BridgeContext>,
    id: String,
}
impl Drop for PendingGuard {
    fn drop(&mut self) {
        if let Ok(mut pending) = self.context.pending.lock() {
            pending.remove(&self.id);
        }
    }
}

async fn call(
    State(context): State<Arc<BridgeContext>>,
    headers: HeaderMap,
    Json(call): Json<Call>,
) -> Result<Json<Value>, StatusCode> {
    if !context.active.load(Ordering::SeqCst)
        || headers.get("authorization").and_then(|h| h.to_str().ok())
            != Some(&format!("Bearer {}", context.token))
        || headers.contains_key("origin")
    {
        return Err(StatusCode::UNAUTHORIZED);
    }
    if !super::builtin_tools()
        .iter()
        .any(|tool| tool.name == call.tool_name)
        || !call.arguments.is_object()
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    let id = uuid::Uuid::new_v4().to_string();
    let (sender, receiver) = oneshot::channel();
    {
        let mut pending = context
            .pending
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        if pending.len() >= 8 {
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        pending.insert(id.clone(), sender);
    }
    let _guard = PendingGuard {
        context: context.clone(),
        id: id.clone(),
    };
    if (context.dispatch)(ToolRequest {
        request_id: context.request_id.clone(),
        tool_request_id: id,
        target: context.target.clone(),
        tool_name: call.tool_name,
        arguments: call.arguments,
    })
    .is_err()
    {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }
    match tokio::time::timeout(Duration::from_secs(25), receiver).await {
        Ok(Ok(value)) if context.active.load(Ordering::SeqCst) => Ok(Json(value)),
        _ => Ok(Json(
            json!({"error":{"code":"frontend_unavailable","message":"画布请求已结束或响应超时。"}}),
        )),
    }
}

async fn start(
    request_id: String,
    window_label: String,
    target: CanvasTarget,
    dispatch: Arc<Dispatcher>,
) -> Result<BridgeLease, String> {
    if request_id.is_empty()
        || request_id.len() > 128
        || target.conversation_id.is_empty()
        || target.project_id.is_empty()
        || target.canvas_id.is_empty()
        || target.project_id.len() > 4096
        || target.canvas_id.len() > 1024
    {
        return Err("MCP 请求缺少有效的画布目标。".into());
    }
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|_| "无法启动 MCP 本机桥接。")?;
    let endpoint = format!(
        "http://{}/call",
        listener.local_addr().map_err(|e| e.to_string())?
    );
    let context = Arc::new(BridgeContext {
        request_id: request_id.clone(),
        window_label,
        target,
        token: format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        ),
        active: AtomicBool::new(true),
        proposal_created: AtomicBool::new(false),
        pending: Mutex::new(HashMap::new()),
        dispatch,
    });
    {
        let mut active = ACTIVE.lock().map_err(|_| "MCP 状态不可用。")?;
        if active.get(&request_id).and_then(Weak::upgrade).is_some() {
            return Err("重复的 MCP 请求。".into());
        }
        active.insert(request_id, Arc::downgrade(&context));
    }
    let router = Router::new()
        .route("/call", post(call))
        .layer(DefaultBodyLimit::max(4 * 1024 * 1024))
        .with_state(context.clone());
    let task = tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });
    Ok(BridgeLease {
        context,
        task,
        endpoint,
    })
}

pub async fn start_for_window(
    app: AppHandle,
    label: String,
    request_id: String,
    target: CanvasTarget,
) -> Result<BridgeLease, String> {
    let dispatch_label = label.clone();
    start(
        request_id,
        label,
        target,
        Arc::new(move |event| {
            app.emit_to(&dispatch_label, "mcp:call", event)
                .map_err(|_| "画布窗口不可用。".into())
        }),
    )
    .await
}

pub fn sidecar_path(app: &AppHandle) -> Result<PathBuf, String> {
    let filename = if cfg!(windows) {
        "agentikz-mcp.exe"
    } else {
        "agentikz-mcp"
    };
    let mut candidates = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join(filename));
        }
    }
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join(filename));
    }
    #[cfg(debug_assertions)]
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(filename),
    );
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or("未找到内置 MCP 程序。请运行 npm run mcp:stage，或重新安装完整桌面包。".into())
}

impl BridgeLease {
    pub(crate) fn runtime_connection(&self) -> Value {
        json!({ "endpoint": self.endpoint, "token": self.context.token })
    }

    pub fn has_proposal(&self) -> bool {
        self.context.proposal_created.load(Ordering::SeqCst)
    }

    pub fn server(&self, app: &AppHandle) -> Result<McpServer, String> {
        Ok(McpServer::Stdio(
            McpServerStdio::new("agentikz", sidecar_path(app)?).env(vec![
                EnvVariable::new("AGENTIKZ_MCP_ENDPOINT", self.endpoint.clone()),
                EnvVariable::new("AGENTIKZ_MCP_TOKEN", self.context.token.clone()),
            ]),
        ))
    }
}

#[tauri::command]
pub fn mcp_tool_result(
    window: WebviewWindow,
    request_id: String,
    tool_request_id: String,
    result: Value,
) -> Result<(), String> {
    if result.to_string().len() > 4 * 1024 * 1024 {
        return Err("MCP 工具结果超过 4 MiB。".into());
    }
    let context = ACTIVE
        .lock()
        .map_err(|_| "MCP 状态不可用。")?
        .get(&request_id)
        .and_then(Weak::upgrade)
        .ok_or("MCP 请求已结束。")?;
    if context.window_label != window.label() || !context.active.load(Ordering::SeqCst) {
        return Err("MCP 请求目标无效。".into());
    }
    context.complete(&tool_request_id, result)
}

#[tauri::command]
pub async fn mcp_test_builtin(
    app: AppHandle,
    window: WebviewWindow,
    request_id: String,
    target: CanvasTarget,
) -> Result<Vec<super::ToolSpec>, String> {
    if !super::read_config(&app)?.builtin_enabled {
        return Err("请先开启内置 MCP 服务。".into());
    }
    let lease = start_for_window(app.clone(), window.label().into(), request_id, target).await?;
    let env = HashMap::from([
        ("AGENTIKZ_MCP_ENDPOINT".into(), lease.endpoint.clone()),
        ("AGENTIKZ_MCP_TOKEN".into(), lease.context.token.clone()),
    ]);
    agentikz_mcp::probe_builtin(&sidecar_path(&app)?, &env).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target() -> CanvasTarget {
        CanvasTarget {
            conversation_id: "chat".into(),
            project_id: "project".into(),
            canvas_id: "canvas".into(),
        }
    }
    fn dispatch(event: ToolRequest) -> Result<(), String> {
        assert_eq!(event.target.canvas_id, "canvas");
        let context = ACTIVE
            .lock()
            .unwrap()
            .get(&event.request_id)
            .and_then(Weak::upgrade)
            .unwrap();
        let result = if event.tool_name == "propose_tikz_patch" {
            json!({"proposalId":"test-proposal","status":"pending","applied":false})
        } else {
            json!({"source":"real bridge response","revision":1})
        };
        context.complete(&event.tool_request_id, result)
    }

    #[tokio::test]
    async fn authenticates_binds_and_revokes_bridge_requests() {
        let id = uuid::Uuid::new_v4().to_string();
        let lease = start(id.clone(), "window".into(), target(), Arc::new(dispatch))
            .await
            .unwrap();
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let body = json!({"toolName":"get_canvas_source","arguments":{}});
        let denied = client
            .post(&lease.endpoint)
            .json(&body)
            .send()
            .await
            .unwrap();
        assert_eq!(denied.status(), StatusCode::UNAUTHORIZED);
        let response = client
            .post(&lease.endpoint)
            .bearer_auth(&lease.context.token)
            .json(&body)
            .send()
            .await
            .unwrap();
        assert_eq!(
            response.json::<Value>().await.unwrap()["source"],
            "real bridge response"
        );
        assert!(lease.context.pending.lock().unwrap().is_empty());
        assert!(!lease.has_proposal());
        client
            .post(&lease.endpoint)
            .bearer_auth(&lease.context.token)
            .json(&json!({"toolName":"propose_tikz_patch","arguments":{}}))
            .send()
            .await
            .unwrap();
        assert!(lease.has_proposal());
        assert!(
            start(id.clone(), "other".into(), target(), Arc::new(dispatch))
                .await
                .is_err()
        );
        lease.context.revoke();
        let denied = client
            .post(&lease.endpoint)
            .bearer_auth(&lease.context.token)
            .json(&body)
            .send()
            .await
            .unwrap();
        assert_eq!(denied.status(), StatusCode::UNAUTHORIZED);
        drop(lease);
        assert!(!ACTIVE.lock().unwrap().contains_key(&id));
    }

    #[tokio::test]
    async fn real_stdio_sidecar_reaches_the_app_bridge() {
        let filename = if cfg!(windows) {
            "agentikz-mcp.exe"
        } else {
            "agentikz-mcp"
        };
        let executable = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(filename);
        assert!(
            executable.is_file(),
            "Run npm run mcp:stage before backend tests"
        );
        let lease = start(
            uuid::Uuid::new_v4().to_string(),
            "window".into(),
            target(),
            Arc::new(dispatch),
        )
        .await
        .unwrap();
        let env = HashMap::from([
            ("AGENTIKZ_MCP_ENDPOINT".into(), lease.endpoint.clone()),
            ("AGENTIKZ_MCP_TOKEN".into(), lease.context.token.clone()),
        ]);
        let tools = agentikz_mcp::probe_builtin(&executable, &env)
            .await
            .unwrap();
        assert_eq!(tools.len(), 13);
        assert!(tools.iter().any(|tool| tool.name == "propose_project_patch"));
        assert!(tools
            .iter()
            .any(|tool| tool.name == "propose_surgical_diff"));
        assert!(lease.context.pending.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn revocation_releases_pending_frontend_calls() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let lease = start(
            uuid::Uuid::new_v4().to_string(),
            "window".into(),
            target(),
            Arc::new(move |event| tx.send(event).map_err(|e| e.to_string())),
        )
        .await
        .unwrap();
        let endpoint = lease.endpoint.clone();
        let token = lease.context.token.clone();
        let call = tokio::spawn(async move {
            reqwest::Client::builder()
                .no_proxy()
                .build()
                .unwrap()
                .post(endpoint)
                .bearer_auth(token)
                .json(&json!({"toolName":"get_canvas_source","arguments":{}}))
                .send()
                .await
                .unwrap()
                .json::<Value>()
                .await
                .unwrap()
        });
        tokio::time::timeout(Duration::from_secs(3), rx.recv())
            .await
            .unwrap()
            .unwrap();
        lease.context.revoke();
        assert!(tokio::time::timeout(Duration::from_secs(3), call)
            .await
            .unwrap()
            .unwrap()
            .get("error")
            .is_some());
        assert!(lease.context.pending.lock().unwrap().is_empty());
    }
}
