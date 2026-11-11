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
static SESSION_CREDENTIALS: LazyLock<Mutex<HashMap<String, String>>> =
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
    #[serde(default)]
    proxy_url: Option<String>,
    #[serde(default)]
    user_agent: Option<String>,
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

pub(crate) fn normalize_http_proxy_for_node(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.len() > 2048
        || trimmed.bytes().any(|b| b < 0x20 || b == 0x7f)
    {
        return None;
    }
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };
    let url = tauri::Url::parse(&candidate).ok()?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return None;
    }
    let rendered = url.to_string();
    if url.path() == "/" && url.query().is_none() && url.fragment().is_none() {
        Some(rendered.trim_end_matches('/').to_string())
    } else {
        Some(rendered)
    }
}

fn validate_proxy_url(proxy_url: Option<&str>) -> Result<Option<String>, String> {
    let Some(trimmed) = proxy_url.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    if trimmed.len() > 2048 || trimmed.bytes().any(|b| b < 0x20 || b == 0x7f) {
        return Err("代理地址格式无效。".into());
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("socks5://")
        || lower.starts_with("socks5h://")
        || lower.starts_with("socks4://")
        || lower.starts_with("socks://")
    {
        return Err(
            "内置 Pi 的 Node.js 运行时仅支持 HTTP(S) 代理（如 Clash 混合端口 http://127.0.0.1:7890 或 v2rayN HTTP 端口 http://127.0.0.1:10809），暂不支持 socks5://。"
                .into(),
        );
    }
    normalize_http_proxy_for_node(trimmed).map(Some).ok_or_else(|| {
        "代理地址格式无效，请填写 HTTP(S) 代理地址（例如 http://127.0.0.1:7890）。".into()
    })
}

fn validate_user_agent(user_agent: Option<&str>) -> Result<Option<String>, String> {
    let Some(trimmed) = user_agent.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    if trimmed.len() > 512 || !trimmed.bytes().all(|b| (0x20..=0x7e).contains(&b)) {
        return Err("自定义 User-Agent 仅支持单行可见 ASCII 字符（最长 512 字符）。".into());
    }
    Ok(Some(trimmed.to_string()))
}

pub(crate) fn merge_loopback_no_proxy(existing: Option<&str>) -> String {
    let mut items: Vec<String> = existing
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
        .collect();
    for required in ["127.0.0.1", "localhost", "::1", "[::1]"] {
        if !items.iter().any(|item| item.eq_ignore_ascii_case(required)) {
            items.push(required.to_string());
        }
    }
    items.join(",")
}

fn store_credential(provider: &str, key: &str) -> Result<(), String> {
    validate_provider(provider)?;
    let stored_in_os = keyring::Entry::new(CREDENTIAL_SERVICE, provider)
        .and_then(|entry| entry.set_password(key))
        .is_ok();
    if let Ok(mut mem) = SESSION_CREDENTIALS.lock() {
        mem.insert(provider.to_string(), key.to_string());
        return Ok(());
    }
    if stored_in_os {
        Ok(())
    } else {
        Err("无法保存到系统凭据存储；未写入明文文件。".into())
    }
}

fn load_credential(provider: &str) -> Result<Option<String>, String> {
    validate_provider(provider)?;
    if let Ok(mem) = SESSION_CREDENTIALS.lock() {
        if let Some(value) = mem.get(provider).filter(|v| !v.is_empty()) {
            return Ok(Some(value.clone()));
        }
    }
    let Ok(entry) = keyring::Entry::new(CREDENTIAL_SERVICE, provider) else {
        return Ok(None);
    };
    match entry.get_password() {
        Ok(value) if !value.is_empty() => Ok(Some(value)),
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Ok(None),
    }
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
    store_credential(&provider, key)?;
    close_window(window.label());
    Ok(())
}

#[tauri::command]
pub fn pi_delete_api_key(window: WebviewWindow, provider: String) -> Result<(), String> {
    validate_provider(&provider)?;
    if let Ok(mut mem) = SESSION_CREDENTIALS.lock() {
        mem.remove(&provider);
    }
    if let Ok(entry) = keyring::Entry::new(CREDENTIAL_SERVICE, &provider) {
        let _ = entry.delete_credential();
    }
    close_window(window.label());
    Ok(())
}

#[tauri::command]
pub fn pi_has_api_key(provider: String) -> Result<bool, String> {
    Ok(load_credential(&provider)?.is_some())
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
    let trimmed = version.trim().trim_start_matches('v');
    let parts: Vec<&str> = trimmed.split('.').collect();
    if parts.len() != 3 {
        return false;
    }
    let Ok(major) = parts[0].parse::<u32>() else {
        return false;
    };
    let Ok(minor) = parts[1].parse::<u32>() else {
        return false;
    };
    let patch_part = parts[2].split(['-', '+']).next().unwrap_or("");
    if patch_part.parse::<u32>().is_err() {
        return false;
    }
    major > 20 || (major == 20 && minor >= 12)
}

async fn resolve_supported_node() -> Result<PathBuf, String> {
    let search_paths = crate::acp::merged_path_entries(None);
    let candidates =
        crate::acp::find_all_executables_in_paths(std::path::Path::new("node"), &search_paths);
    if candidates.is_empty() {
        return Err(
            "未检测到 Node.js。请安装 Node.js 20.12 或更新版本（推荐 LTS 22/24），安装后点击「重新检测」。"
                .into(),
        );
    }
    let mut first_rejected: Option<(String, String)> = None;
    for candidate in candidates {
        let normalized = crate::acp::protocol_workspace_path(candidate);
        let mut check = Command::new(&normalized);
        restricted_environment(&mut check, None);
        check.arg("--version").kill_on_drop(true);
        #[cfg(windows)]
        check.creation_flags(0x08000000);
        if let Ok(Ok(output)) = timeout(Duration::from_secs(6), check.output()).await {
            let ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if output.status.success() && node_version_supported(&ver) {
                return Ok(normalized);
            }
            if first_rejected.is_none() && !ver.is_empty() {
                first_rejected = Some((ver, normalized.display().to_string()));
            }
        }
    }
    if let Some((ver, path)) = first_rejected {
        Err(format!(
            "已检测到 Node.js {ver}（{path}），但内置 Pi 需要 Node.js 20.12 或更新版本。"
        ))
    } else {
        Err("无法启动 Node.js，请确认已安装 Node.js 20.12 或更新版本。".into())
    }
}

fn restricted_environment(command: &mut Command, proxy_url: Option<&str>) {
    command.env_clear();
    // Use merged GUI + version-manager PATH so child processes work outside login shells.
    let merged_paths = crate::acp::merged_path_entries(None);
    if let Ok(joined_path) = std::env::join_paths(&merged_paths) {
        command.env("PATH", joined_path);
    } else if let Some(raw_path) = std::env::var_os("PATH") {
        command.env("PATH", raw_path);
    }
    // No model credentials, NODE_OPTIONS, npm hooks or discovered extension settings.
    for key in [
        "SystemRoot",
        "SystemDrive",
        "WINDIR",
        "ComSpec",
        "ProgramFiles",
        "ProgramFiles(x86)",
        "ProgramW6432",
        "CommonProgramFiles",
        "CommonProgramW6432",
        "ProgramData",
        "PATHEXT",
        "TEMP",
        "TMP",
        "HOME",
        "HOMEDRIVE",
        "HOMEPATH",
        "USERPROFILE",
        "LOCALAPPDATA",
        "APPDATA",
        "VOLTA_HOME",
        "NVM_HOME",
        "NVM_SYMLINK",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "NODE_EXTRA_CA_CERTS",
    ] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    let explicit_proxy = proxy_url.and_then(normalize_http_proxy_for_node);
    if let Some(proxy) = explicit_proxy {
        for key in ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"] {
            command.env(key, &proxy);
        }
        command.env("AGEN_PI_PROXY_MODE", "explicit");
    } else {
        let ambient_http = ["HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"]
            .iter()
            .find_map(|key| std::env::var(key).ok().and_then(|v| normalize_http_proxy_for_node(&v)));
        let ambient_https = ["HTTPS_PROXY", "https_proxy"]
            .iter()
            .find_map(|key| std::env::var(key).ok().and_then(|v| normalize_http_proxy_for_node(&v)))
            .or_else(|| ambient_http.clone());
        if let Some(http_p) = &ambient_http {
            command.env("HTTP_PROXY", http_p);
            command.env("http_proxy", http_p);
        }
        if let Some(https_p) = &ambient_https {
            command.env("HTTPS_PROXY", https_p);
            command.env("https_proxy", https_p);
        }
        if ambient_http.is_some() || ambient_https.is_some() {
            command.env("AGEN_PI_PROXY_MODE", "ambient");
        }
    }
    let base_no_proxy = std::env::var("NO_PROXY")
        .ok()
        .or_else(|| std::env::var("no_proxy").ok());
    let merged_no_proxy = merge_loopback_no_proxy(base_no_proxy.as_deref());
    command.env("NO_PROXY", &merged_no_proxy);
    command.env("no_proxy", &merged_no_proxy);
}

struct Worker {
    _child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    stderr: tokio::task::JoinHandle<()>,
    proxy_url: Option<String>,
    last_used: Instant,
}
impl Drop for Worker {
    fn drop(&mut self) {
        self.stderr.abort();
    }
}
impl Worker {
    async fn start(app: &AppHandle, proxy_url: Option<String>) -> Result<Self, String> {
        let node = resolve_supported_node().await?;
        let entry = worker_path(app)?;
        let cwd = app
            .path()
            .app_data_dir()
            .map_err(|_| "无法定位应用目录。")?
            .join("pi-workspace");
        std::fs::create_dir_all(&cwd).map_err(|_| "无法创建 Pi 工作目录。")?;
        Self::start_at_with_proxy(node, entry, cwd, proxy_url).await
    }

    #[cfg(test)]
    async fn start_at(node: PathBuf, entry: PathBuf, cwd: PathBuf) -> Result<Self, String> {
        Self::start_at_with_proxy(node, entry, cwd, None).await
    }

    async fn start_at_with_proxy(
        node: PathBuf,
        entry: PathBuf,
        cwd: PathBuf,
        proxy_url: Option<String>,
    ) -> Result<Self, String> {
        // Node cannot load an entrypoint using Windows verbatim paths (\\?\),
        // including the canonicalized resource_dir supplied by Tauri. Normalize
        // at the process boundary so all callers, including tests, use safe paths.
        let node = crate::acp::protocol_workspace_path(node);
        let entry = crate::acp::protocol_workspace_path(entry);
        let cwd = crate::acp::protocol_workspace_path(cwd);
        let mut check = Command::new(&node);
        restricted_environment(&mut check, None);
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
            return Err("内置 Pi 需要 Node.js 20.12 或更新版本；不会自动下载安装。".into());
        }
        let mut command = Command::new(node);
        restricted_environment(&mut command, proxy_url.as_deref());
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
            proxy_url,
            last_used: Instant::now(),
        };
        let ready = timeout(Duration::from_secs(30), worker.read())
            .await
            .map_err(|_| "Pi 启动超时。")?
            .map_err(|error| format!("Pi 启动失败（尚未就绪）：{error} 请检查内置运行时是否完整。"))?;
        if ready["type"] == "startup_error" {
            let code = ready["code"].as_str().unwrap_or("StartupError");
            return Err(format!(
                "Pi 运行时初始化失败（{code}），请检查安装包完整性或代理配置。"
            ));
        }
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
                    if matches!(frame["kind"].as_str(), Some("message" | "thought" | "mcp_status")) {
                        let _ = app.emit_to(window, "acp:stream", &frame);
                    }
                }
                Some("result" | "models" | "channel_status") => {
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
    let mut worker = Worker::start(&app, None).await?;
    let request = json!({"type":"inspect", "requestId":uuid::Uuid::new_v4().to_string()});
    let result = timeout(
        Duration::from_secs(30),
        worker.run(&app, window.label(), &request),
    )
    .await
    .map_err(|_| "Pi 模型目录读取超时。")??;
    Ok(
        json!({"ok":true, "agentName":"Pi SDK", "agentVersion":"1.5.0", "protocolVersion":"AgenTikZ Pi/1",
        "message":"Pi 本地运行时已就绪；请在下方配置渠道密钥并点击「测试模型连通性」验证网关。", "models":result["models"]}),
    )
}

#[tauri::command]
pub async fn pi_fetch_models(
    app: AppHandle,
    window: WebviewWindow,
    channel: PiChannel,
    proxy_url: Option<String>,
    user_agent: Option<String>,
) -> Result<Value, String> {
    channel.validate()?;
    let proxy = validate_proxy_url(proxy_url.as_deref())?;
    let ua = validate_user_agent(user_agent.as_deref())?;
    let api_key = load_credential(&channel.id)?
        .ok_or_else(|| "请先保存该渠道的 API Key。".to_string())?;
    let mut worker = Worker::start(&app, proxy).await?;
    let request = json!({
        "type":"fetch_models",
        "requestId":uuid::Uuid::new_v4().to_string(),
        "channel":channel,
        "apiKey":api_key,
        "userAgent":ua,
    });
    let result = timeout(Duration::from_secs(60), worker.run(&app, window.label(), &request))
        .await.map_err(|_| "获取模型超时，请检查渠道地址或手动添加模型。")??;
    Ok(result["models"].clone())
}

#[tauri::command]
pub async fn pi_test_channel(
    app: AppHandle,
    window: WebviewWindow,
    channel: PiChannel,
    model: Option<String>,
    thinking_level: Option<String>,
    proxy_url: Option<String>,
    user_agent: Option<String>,
) -> Result<Value, String> {
    channel.validate()?;
    let proxy = validate_proxy_url(proxy_url.as_deref())?;
    let ua = validate_user_agent(user_agent.as_deref())?;
    let level = thinking_level
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("auto");
    if !matches!(
        level,
        "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
    ) {
        return Err("思考强度参数无效。".into());
    }
    let api_key = load_credential(&channel.id)?
        .ok_or_else(|| "请先输入并保存该渠道的 API Key。".to_string())?;
    let target_model = model
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .or(channel.default_model_id.as_deref())
        .or_else(|| channel.models.first().map(|m| m.id.as_str()))
        .ok_or_else(|| "请先添加或输入至少一个模型 ID（例如 deepseek-v4.1-flash）。".to_string())?;
    let mut worker = Worker::start(&app, proxy).await?;
    let request = json!({
        "type":"test_channel",
        "requestId":uuid::Uuid::new_v4().to_string(),
        "channel":channel,
        "model":target_model,
        "thinkingLevel":level,
        "apiKey":api_key,
        "userAgent":ua,
    });
    let result = timeout(
        Duration::from_secs(35),
        worker.run(&app, window.label(), &request),
    )
    .await
    .map_err(|_| "模型网关连通性测试超时（35s），请检查网关地址与代理设置。")??;
    let model_name = result["model"].as_str().unwrap_or(target_model);
    let latency_ms = result["latencyMs"].as_u64().unwrap_or(0);
    let level_label = if level == "auto" {
        "默认（不传参数）".to_string()
    } else {
        level.to_string()
    };
    Ok(json!({
        "ok": true,
        "latencyMs": result["latencyMs"],
        "model": result["model"],
        "baseUrl": result["baseUrl"],
        "api": result["api"],
        "thinkingLevel": level,
        "message": format!("网关连通性验证通过 · 模型 {model_name} · 思考强度 {level_label} · 耗时 {latency_ms} ms"),
    }))
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
    let proxy_url = validate_proxy_url(request.proxy_url.as_deref())?;
    let user_agent = validate_user_agent(request.user_agent.as_deref())?;
    crate::agent_image::validate_images(&request.images)?;
    crate::agent_image::validate_images(&request.reference_images)?;
    if request.request_id.is_empty()
        || request.request_id.len() > 128
        || request.model.is_empty()
        || request.model.len() > 256
        || !matches!(
            request.thinking_level.as_str(),
            "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
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
    let api_key = load_credential(credential_id)?
        .ok_or_else(|| "请在设置 → Agent → 内置 Pi 中保存当前渠道的 API Key。".to_string())?;
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
        "channel":request.channel, "userAgent":user_agent,
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
        .is_some_and(|w| w.last_used.elapsed() > Duration::from_secs(900) || w.proxy_url != proxy_url)
    {
        worker.take();
    }
    if worker.is_none() {
        let _ = app.emit_to(
            window.label(),
            "acp:stream",
            &json!({"requestId":request.request_id, "kind":"mcp_status", "text":"正在启动内置 Pi 运行时（校验 Node.js 与 SDK）…"}),
        );
        let startup = tokio::select! {
            _ = cancelled.changed() => Err("Pi 请求已取消。".to_string()),
            result = Worker::start(&app, proxy_url) => result,
        }?;
        *worker = Some(startup);
    } else {
        let _ = app.emit_to(
            window.label(),
            "acp:stream",
            &json!({"requestId":request.request_id, "kind":"mcp_status", "text":"已复用内置 Pi 常驻进程，正在派发任务…"}),
        );
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
        restricted_environment(&mut command, Some("127.0.0.1:7890"));
        let envs: HashMap<String, String> = command
            .as_std()
            .get_envs()
            .filter_map(|(k, v)| Some((k.to_string_lossy().to_string(), v?.to_string_lossy().to_string())))
            .collect();
        for key in ["NODE_OPTIONS", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "NODE_USE_ENV_PROXY"] {
            assert!(!envs.contains_key(key));
        }
        assert_eq!(envs.get("HTTPS_PROXY").map(String::as_str), Some("http://127.0.0.1:7890"));
        assert_eq!(envs.get("AGEN_PI_PROXY_MODE").map(String::as_str), Some("explicit"));
        assert!(envs.get("NO_PROXY").is_some_and(|v| v.contains("127.0.0.1") && v.contains("localhost")));
        assert!(validate_proxy_url(Some("127.0.0.1:7890")).unwrap().as_deref() == Some("http://127.0.0.1:7890"));
        assert!(validate_proxy_url(Some("socks5://127.0.0.1:10808")).is_err());
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
        assert!(!node_version_supported("v18.20.4"));
        assert!(!node_version_supported("v20.11.1"));
        assert!(node_version_supported("v20.12.0"));
        assert!(node_version_supported("v22.14.0"));
        assert!(node_version_supported("v22.19.0-rc.1"));
        assert!(node_version_supported("v24.14.1\n"));
        assert!(!node_version_supported("not node"));
        assert!(!node_version_supported("v22.foo.19"));
        assert!(validate_provider("openrouter").is_ok());
        assert!(validate_provider("../credentials").is_err());
        assert!(validate_provider("").is_err());
    }
}
