//! Embedded Pi SDK worker. No shell, native file tools or discovered extensions.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::PathBuf,
    process::Stdio,
    sync::{Arc, LazyLock, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::watch,
    time::timeout,
};

const CREDENTIAL_SERVICE: &str = "ai.agentikz.pi.credentials";
type WorkerSlot = Arc<tokio::sync::Mutex<Option<Worker>>>;
static WORKERS: LazyLock<Mutex<HashMap<String, WorkerSlot>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
struct Running {
    window: String,
    cancel: watch::Sender<bool>,
}
static RUNNING: LazyLock<Mutex<HashMap<String, Running>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
struct RequestGuard(String);
impl Drop for RequestGuard {
    fn drop(&mut self) {
        if let Ok(mut jobs) = RUNNING.lock() {
            jobs.remove(&self.0);
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PiPrompt {
    request_id: String,
    conversation_id: String,
    provider: String,
    #[serde(default)]
    channel: Option<PiChannel>,
    model: String,
    thinking_level: String,
    prompt: String,
    #[serde(default)]
    history: Vec<crate::acp::ConversationMessage>,
    #[serde(default)]
    images: Vec<crate::agent_image::AgentImage>,
    #[serde(default)]
    reference_images: Vec<crate::agent_image::AgentImage>,
    target: crate::mcp::bridge::CanvasTarget,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PiChannel {
    id: String,
    name: String,
    provider: String,
    api: String,
    base_url: String,
    #[serde(default)]
    default_model_id: Option<String>,
    models: Vec<PiChannelModel>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PiChannelModel {
    id: String,
    name: String,
    reasoning: bool,
    supports_images: bool,
    context_window: u32,
    max_tokens: u32,
}

impl PiChannel {
    fn validate(&self) -> Result<(), String> {
        validate_provider(&self.id)?;
        if self.models.len() > 2000 || self.name.len() > 400 || self.base_url.len() > 4096
            || !matches!(self.api.as_str(), "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai")
        {
            return Err("Pi 渠道参数无效。".into());
        }
        let url = tauri::Url::parse(&self.base_url).map_err(|_| "Pi 渠道地址无效。")?;
        if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none()
            || !url.username().is_empty() || url.password().is_some()
            || url.query().is_some() || url.fragment().is_some()
        {
            return Err("渠道地址仅支持 HTTP(S)，不能包含用户名、密码、查询参数或片段。".into());
        }
        for model in &self.models {
            if model.id.trim().is_empty() || model.id.len() > 256 || model.name.len() > 1024
                || !(1024..=10_000_000).contains(&model.context_window)
                || model.max_tokens == 0 || model.max_tokens > model.context_window
            {
                return Err("Pi 渠道模型参数无效。".into());
            }
        }
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiResponse {
    pub reply: String,
    pub runtime_started: bool,
    pub resumed: bool,
}

fn validate_provider(provider: &str) -> Result<(), String> {
    if provider.is_empty()
        || provider.len() > 80
        || !provider
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return Err("Pi provider 标识无效。".into());
    }
    Ok(())
}

fn credentials(provider: &str) -> Result<keyring::Entry, String> {
    validate_provider(provider)?;
    keyring::Entry::new(CREDENTIAL_SERVICE, provider).map_err(|_| "系统凭据存储不可用。".into())
}

#[tauri::command]
pub fn pi_save_api_key(
    window: WebviewWindow,
    provider: String,
    api_key: String,
) -> Result<(), String> {
    let key = api_key.trim();
    if key.is_empty() || key.len() > 8192 {
        return Err("请输入有效的 API Key。".into());
    }
    credentials(&provider)?
        .set_password(key)
        .map_err(|_| "无法保存到系统凭据存储；未写入明文文件。")?;
    close_window(window.label());
    Ok(())
}

#[tauri::command]
pub fn pi_delete_api_key(window: WebviewWindow, provider: String) -> Result<(), String> {
    match credentials(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(_) => return Err("无法删除系统凭据。".into()),
    }
    close_window(window.label());
    Ok(())
}

#[tauri::command]
pub fn pi_has_api_key(provider: String) -> Result<bool, String> {
    match credentials(&provider)?.get_password() {
        Ok(value) => Ok(!value.is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(_) => Err("系统凭据存储不可用。".into()),
    }
}

fn worker_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Ok(root) = app.path().resource_dir() {
        candidates.push(root.join("pi-runtime/worker.mjs"));
    }
    #[cfg(debug_assertions)]
    {
        candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("pi-runtime/worker.mjs"));
        candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../runtime/pi/worker.mjs"));
    }
    candidates
        .into_iter()
        .find(|p| {
            p.is_file()
                && p.parent()
                    .unwrap()
                    .join("node_modules/@earendil-works/pi-coding-agent/package.json")
                    .is_file()
        })
        .ok_or("未找到内置 Pi SDK。请运行 npm run pi:stage 或重新安装完整桌面包。".into())
}

fn node_version_supported(version: &str) -> bool {
    let Ok(numbers) = version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .map(str::parse::<u32>)
        .collect::<Result<Vec<_>, _>>()
    else {
        return false;
    };
    numbers.len() == 3 && (numbers[0] > 22 || (numbers[0] == 22 && numbers[1] >= 19))
}

fn restricted_environment(command: &mut Command) {
    command.env_clear();
    // No model credentials, NODE_OPTIONS, npm hooks or discovered extension settings.
    for key in [
        "PATH",
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "HOME",
        "USERPROFILE",
        "LOCALAPPDATA",
        "APPDATA",
    ] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
}

struct Worker {
    _child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    stderr: tokio::task::JoinHandle<()>,
    last_used: Instant,
}
impl Drop for Worker {
    fn drop(&mut self) {
        self.stderr.abort();
    }
}
impl Worker {
    async fn start(app: &AppHandle) -> Result<Self, String> {
        let node = crate::acp::resolve_mcp_executable("node")?;
        let entry = worker_path(app)?;
        let cwd = app
            .path()
            .app_data_dir()
            .map_err(|_| "无法定位应用目录。")?
            .join("pi-workspace");
        std::fs::create_dir_all(&cwd).map_err(|_| "无法创建 Pi 工作目录。")?;
        Self::start_at(node, entry, cwd).await
    }

    async fn start_at(node: PathBuf, entry: PathBuf, cwd: PathBuf) -> Result<Self, String> {
        // Node cannot load an entrypoint using Windows verbatim paths (\\?\),
        // including the canonicalized resource_dir supplied by Tauri. Normalize
        // at the process boundary so all callers, including tests, use safe paths.
        let node = crate::acp::protocol_workspace_path(node);
        let entry = crate::acp::protocol_workspace_path(entry);
        let cwd = crate::acp::protocol_workspace_path(cwd);
        let mut check = Command::new(&node);
        restricted_environment(&mut check);
        check.current_dir(&cwd);
        check.arg("--version").kill_on_drop(true);
        #[cfg(windows)]
        check.creation_flags(0x08000000);
        let output = timeout(Duration::from_secs(10), check.output())
            .await
            .map_err(|_| "Node.js 检测超时。")?
            .map_err(|_| "无法启动 Node.js。")?;
        if !output.status.success()
            || !node_version_supported(&String::from_utf8_lossy(&output.stdout))
        {
            return Err("内置 Pi 需要 Node.js 22.19 或更新版本；不会自动下载安装。".into());
        }
        let mut command = Command::new(node);
        restricted_environment(&mut command);
        command
            .arg(entry)
            .current_dir(cwd)
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command.spawn().map_err(|_| "无法启动内置 Pi 进程。")?;
        let input = child.stdin.take().ok_or("Pi stdin 不可用。")?;
        let output = BufReader::new(child.stdout.take().ok_or("Pi stdout 不可用。")?);
        let mut error_output = child.stderr.take().ok_or("Pi stderr 不可用。")?;
        // Drain without persisting or forwarding potentially sensitive provider output.
        let stderr = tokio::spawn(async move {
            let _ = tokio::io::copy(&mut error_output, &mut tokio::io::sink()).await;
        });
        let mut worker = Self {
            _child: child,
            input,
            output,
            stderr,
            last_used: Instant::now(),
        };
        let ready = timeout(Duration::from_secs(30), worker.read())
            .await
            .map_err(|_| "Pi 启动超时。")?
            .map_err(|error| format!("Pi 启动失败（尚未就绪）：{error} 请检查内置运行时是否完整。"))?;
        if ready["type"] != "ready" || ready["protocol"] != 1 || ready["version"] != "1.5.0" {
            return Err("Pi 运行时协议或 SDK 版本不兼容。".into());
        }
        Ok(worker)
    }

    async fn write(&mut self, record: &Value) -> Result<(), String> {
        let mut bytes = serde_json::to_vec(record).map_err(|_| "Pi 请求编码失败。")?;
        if bytes.len() > 16 * 1024 * 1024 {
            return Err("Pi 请求过大，请新建会话或缩小上下文。".into());
        }
        bytes.push(b'\n');
        self.input
            .write_all(&bytes)
            .await
            .map_err(|_| "Pi 进程已退出。".into())
    }

    async fn read(&mut self) -> Result<Value, String> {
        let mut bytes = Vec::new();
        loop {
            let available = self
                .output
                .fill_buf()
                .await
                .map_err(|_| "Pi 输出读取失败。")?;
            if available.is_empty() {
                // Never forward raw stderr: provider failures may include keys
                // or project contents. The exit status is safe to report.
                let status = timeout(Duration::from_secs(1), self._child.wait())
                    .await
                    .ok()
                    .and_then(Result::ok)
                    .and_then(|status| status.code());
                return Err(match status {
                    Some(code) => format!("Pi 进程已退出（退出码 {code}）；运行时需要重建。"),
                    None => "Pi 进程输出已关闭；运行时需要重建。".into(),
                });
            }
            let end = available.iter().position(|b| *b == b'\n').map(|p| p + 1);
            let count = end.unwrap_or(available.len());
            if bytes.len() + count > 4 * 1024 * 1024 {
                return Err("Pi 输出超过限制。".into());
            }
            bytes.extend_from_slice(&available[..count]);
            self.output.consume(count);
            if end.is_some() {
                break;
            }
        }
        serde_json::from_slice(&bytes).map_err(|_| "Pi 返回了无效协议数据。".into())
    }

    async fn run(
        &mut self,
        app: &AppHandle,
        window: &str,
        record: &Value,
    ) -> Result<Value, String> {
        self.write(record).await?;
        loop {
            let frame = self.read().await?;
            if frame["requestId"] != record["requestId"] {
                return Err("Pi 请求标识不匹配。".into());
            }
            match frame["type"].as_str() {
                Some("event") => {
                    if matches!(frame["kind"].as_str(), Some("message" | "mcp_status")) {
                        let _ = app.emit_to(window, "acp:stream", &frame);
                    }
                }
                Some("result" | "models") => {
                    self.last_used = Instant::now();
                    return Ok(frame);
                }
                Some("error") => {
                    return Err(frame["error"].as_str().unwrap_or("Pi 执行失败。").into())
                }
                _ => return Err("Pi 返回了未知事件。".into()),
            }
        }
    }
}

#[tauri::command]
pub async fn pi_probe(app: AppHandle, window: WebviewWindow) -> Result<Value, String> {
    let mut worker = Worker::start(&app).await?;
    let request = json!({"type":"inspect", "requestId":uuid::Uuid::new_v4().to_string()});
    let result = timeout(
        Duration::from_secs(30),
        worker.run(&app, window.label(), &request),
    )
    .await
    .map_err(|_| "Pi 模型目录读取超时。")??;
    Ok(
        json!({"ok":true, "agentName":"Pi SDK", "agentVersion":"1.5.0", "protocolVersion":"AgenTikZ Pi/1",
        "message":"Pi 运行时与模型目录已就绪；未调用模型，不代表 API Key 验证通过。", "models":result["models"]}),
    )
}

#[tauri::command]
pub async fn pi_fetch_models(
    app: AppHandle,
    window: WebviewWindow,
    channel: PiChannel,
) -> Result<Value, String> {
    channel.validate()?;
    let api_key = credentials(&channel.id)?.get_password()
        .map_err(|_| "请先保存该渠道的 API Key。")?;
    let mut worker = Worker::start(&app).await?;
    let request = json!({"type":"fetch_models", "requestId":uuid::Uuid::new_v4().to_string(),
        "channel":channel, "apiKey":api_key});
    let result = timeout(Duration::from_secs(60), worker.run(&app, window.label(), &request))
        .await.map_err(|_| "获取模型超时，请检查渠道地址或手动添加模型。")??;
    Ok(result["models"].clone())
}

#[tauri::command]
pub fn pi_cancel_prompt(window: WebviewWindow, request_id: String) -> Result<(), String> {
    let jobs = RUNNING.lock().map_err(|_| "Pi 状态不可用。")?;
    let job = jobs.get(&request_id).ok_or("Pi 请求已结束。")?;
    if job.window != window.label() {
        return Err("请求不属于当前窗口。".into());
    }
    job.cancel.send(true).map_err(|_| "Pi 请求已结束。".into())
}

pub fn close_window(label: &str) {
    if let Ok(jobs) = RUNNING.lock() {
        for job in jobs.values().filter(|job| job.window == label) {
            let _ = job.cancel.send(true);
        }
    }
    if let Ok(mut workers) = WORKERS.lock() {
        workers.remove(label);
    }
}

#[tauri::command]
pub fn pi_reset_runtime(window: WebviewWindow) {
    close_window(window.label());
}

#[tauri::command]
pub async fn pi_send_prompt(
    app: AppHandle,
    window: WebviewWindow,
    request: PiPrompt,
) -> Result<PiResponse, String> {
    validate_provider(&request.provider)?;
    if let Some(channel) = &request.channel {
        channel.validate()?;
        if !channel.models.iter().any(|model| model.id == request.model) {
            return Err("所选模型不在当前 Pi 渠道中，请重新选择。".into());
        }
    }
    crate::agent_image::validate_images(&request.images)?;
    crate::agent_image::validate_images(&request.reference_images)?;
    if request.request_id.is_empty()
        || request.request_id.len() > 128
        || request.model.is_empty()
        || request.model.len() > 256
        || !matches!(
            request.thinking_level.as_str(),
            "off" | "low" | "medium" | "high"
        )
        || request.conversation_id != request.target.conversation_id
        || request.prompt.len() > 2 * 1024 * 1024
    {
        return Err("Pi 请求参数无效。".into());
    }
    let (cancel, mut cancelled) = watch::channel(false);
    {
        let mut jobs = RUNNING.lock().map_err(|_| "Pi 状态不可用。")?;
        if jobs.contains_key(&request.request_id)
            || jobs.values().any(|job| job.window == window.label())
        {
            return Err("此窗口已有运行中的 Pi 请求。".into());
        }
        jobs.insert(
            request.request_id.clone(),
            Running {
                window: window.label().into(),
                cancel,
            },
        );
    }
    let _guard = RequestGuard(request.request_id.clone());
    let credential_id = request.channel.as_ref().map(|channel| channel.id.as_str()).unwrap_or(&request.provider);
    let api_key = credentials(credential_id)?
        .get_password()
        .map_err(|_| "请在设置 → Agent → 内置 Pi 中保存当前渠道的 API Key。")?;
    let config = crate::mcp::mcp_get_config(app.clone()).await?;
    if !config.builtin_enabled {
        return Err("请先启用内置 MCP 工具；Pi 不会改用原生文件或命令工具。".into());
    }
    let lease = crate::mcp::bridge::start_for_window(
        app.clone(),
        window.label().into(),
        request.request_id.clone(),
        request.target.clone(),
    )
    .await?;
    let record = json!({
        "type":"prompt", "requestId":request.request_id, "conversationId":request.conversation_id,
        "projectId":request.target.project_id, "provider":request.provider, "model":request.model,
        "channel":request.channel,
        "apiKey":api_key, "prompt":request.prompt, "history":request.history, "thinkingLevel":request.thinking_level,
        "images":request.images,
        "referenceImages":request.reference_images,
        "tools":crate::mcp::builtin_tools(), "bridge":lease.runtime_connection()
    });
    let slot = {
        let mut workers = WORKERS.lock().map_err(|_| "Pi 进程池不可用。")?;
        workers
            .entry(window.label().into())
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(None)))
            .clone()
    };
    let mut worker = slot.lock().await;
    if worker
        .as_ref()
        .is_some_and(|w| w.last_used.elapsed() > Duration::from_secs(900))
    {
        worker.take();
    }
    if worker.is_none() {
        let startup = tokio::select! {
            _ = cancelled.changed() => Err("Pi 请求已取消。".to_string()),
            result = Worker::start(&app) => result,
        }?;
        *worker = Some(startup);
    }
    if *cancelled.borrow() {
        worker.take();
        return Err("Pi 请求已取消。".into());
    }
    let running = worker.as_mut().unwrap();
    let result = tokio::select! {
        _ = cancelled.changed() => Err("Pi 请求已取消；下轮会重建运行时并恢复可见对话。".to_string()),
        result = timeout(Duration::from_secs(600), running.run(&app, window.label(), &record)) =>
            result.map_err(|_| "Pi 任务超过 10 分钟上限。".to_string()).and_then(|r| r),
    };
    match result {
        Ok(value) => {
            let reply = value["reply"].as_str().unwrap_or("").to_string();
            if reply.trim().is_empty() && !lease.has_proposal() {
                worker.take();
                return Err("Pi 未返回文本或修改提案，运行时已重置。".into());
            }
            Ok(PiResponse {
                reply: if reply.trim().is_empty() {
                    "已提交修改提案，请审核后应用。".into()
                } else {
                    reply
                },
                runtime_started: true,
                resumed: value["resumed"].as_bool().unwrap_or(false),
            })
        }
        Err(error) => {
            worker.take();
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_custom_channels_and_rejects_credential_fields_in_renderer_configuration() {
        let value = json!({"id":"channel-one","name":"Local gateway","provider":"openai",
            "api":"openai-completions","baseUrl":"https://example.test/proxy/v1","defaultModelId":"fixture",
            "models":[{"id":"fixture","name":"Fixture","reasoning":false,"supportsImages":false,
                "contextWindow":32768,"maxTokens":4096}]});
        let mut channel: PiChannel = serde_json::from_value(value.clone()).unwrap();
        assert!(channel.validate().is_ok());
        channel.base_url = "https://example.test/v1?key=secret".into();
        assert!(channel.validate().is_err());
        channel.base_url = "https://user:secret@example.test/v1".into();
        assert!(channel.validate().is_err());
        channel.base_url = "file:///tmp/models".into();
        assert!(channel.validate().is_err());
        let mut secret = value.clone();
        secret["apiKey"] = json!("must-not-accept");
        assert!(serde_json::from_value::<PiChannel>(secret).is_err());
        let mut nested = value;
        nested["models"][0]["apiKey"] = json!("must-not-accept");
        assert!(serde_json::from_value::<PiChannel>(nested).is_err());
    }

    #[test]
    fn worker_and_version_probe_do_not_inherit_injected_node_hooks_or_credentials() {
        let mut command = Command::new("node");
        command.env("NODE_OPTIONS", "--require=untrusted.js");
        command.env("ANTHROPIC_API_KEY", "test-only-do-not-inherit");
        command.env("OPENAI_API_KEY", "test-only-do-not-inherit");
        restricted_environment(&mut command);
        let names: Vec<_> = command
            .as_std()
            .get_envs()
            .map(|(key, _)| key.to_string_lossy().to_string())
            .collect();
        for key in ["NODE_OPTIONS", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"] {
            assert!(!names.iter().any(|name| name == key));
        }
    }

    #[tokio::test]
    async fn real_worker_round_trips_catalog_in_a_long_lived_process() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("pi-runtime");
        let node = crate::acp::resolve_mcp_executable("node").unwrap();
        let mut worker = Worker::start_at(node, root.join("worker.mjs"), root)
            .await
            .unwrap();
        let pid = worker._child.id();
        for id in ["first", "second", "unicode\u{2028}record"] {
            worker
                .write(&json!({"type":"inspect", "requestId":id}))
                .await
                .unwrap();
            let response = timeout(Duration::from_secs(20), worker.read())
                .await
                .unwrap()
                .unwrap();
            assert_eq!(response["type"], "models");
            assert_eq!(response["requestId"], id);
            assert!(response["models"]
                .as_array()
                .is_some_and(|models| !models.is_empty()));
            assert_eq!(worker._child.id(), pid);
        }
        worker.write(&json!({"type":"shutdown"})).await.unwrap();
        timeout(Duration::from_secs(5), worker._child.wait())
            .await
            .unwrap()
            .unwrap();
    }

    // Tauri's resource_dir is derived from a canonicalized executable path on
    // Windows. Test that actual path shape, not only CARGO_MANIFEST_DIR paths.
    #[cfg(windows)]
    #[tokio::test]
    async fn real_worker_starts_from_canonicalized_windows_resource_paths() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("pi-runtime");
        let entry = root.join("worker.mjs").canonicalize().unwrap();
        assert!(entry.to_string_lossy().starts_with(r"\\?\"));
        let node = crate::acp::resolve_mcp_executable("node").unwrap();
        let mut worker = Worker::start_at(node, entry, root.canonicalize().unwrap())
            .await
            .unwrap();
        worker.write(&json!({"type":"inspect", "requestId":"windows-resource"}))
            .await
            .unwrap();
        let response = timeout(Duration::from_secs(20), worker.read())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(response["type"], "models");
        assert_eq!(response["requestId"], "windows-resource");
        assert!(response["models"].as_array().is_some_and(|models| !models.is_empty()));

        // Exercise model discovery through the desktop worker protocol, not a
        // direct JS import. A channel HTTP failure must not look like a crash.
        use axum::{http::HeaderMap, routing::get, Json, Router};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let router = Router::new().route("/v1/models", get(|headers: HeaderMap| async move {
                assert_eq!(headers.get("authorization").unwrap(), "Bearer fixture-only-key");
                Json(json!({"data":[{"id":"fixture-model"}]}))
            }));
            axum::serve(listener, router).await.unwrap();
        });
        let pid = worker._child.id();
        for (id, base_path, expected_type) in [
            ("discover", "/v1", "models"),
            ("missing-endpoint", "/missing/v1", "error"),
        ] {
            worker.write(&json!({"type":"fetch_models", "requestId":id,
                "channel":{"id":"fixture", "api":"openai-completions",
                    "baseUrl":format!("http://{address}{base_path}")},
                "apiKey":"fixture-only-key"}))
                .await.unwrap();
            let result = timeout(Duration::from_secs(20), worker.read()).await.unwrap().unwrap();
            assert_eq!(result["requestId"], id);
            assert_eq!(result["type"], expected_type);
            if expected_type == "models" {
                assert_eq!(result["models"][0]["id"], "fixture-model");
            } else {
                assert!(result["error"].as_str().unwrap().contains("HTTP 404"));
                assert!(!result.to_string().contains("fixture-only-key"));
            }
            assert_eq!(worker._child.id(), pid);
        }
        server.abort();
        worker.write(&json!({"type":"inspect", "requestId":"after-discovery"})).await.unwrap();
        let result = timeout(Duration::from_secs(20), worker.read()).await.unwrap().unwrap();
        assert_eq!(result["type"], "models");
        assert_eq!(result["requestId"], "after-discovery");
    }

    #[test]
    fn validates_node_minimum_and_provider_ids() {
        assert!(!node_version_supported("v22.18.0"));
        assert!(node_version_supported("v22.19.0"));
        assert!(node_version_supported("v24.14.1\n"));
        assert!(!node_version_supported("not node"));
        assert!(!node_version_supported("v22.foo.19"));
        assert!(validate_provider("openrouter").is_ok());
        assert!(validate_provider("../credentials").is_err());
        assert!(validate_provider("").is_err());
    }
}
