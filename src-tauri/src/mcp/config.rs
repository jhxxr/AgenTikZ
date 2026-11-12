use agent_client_protocol::v1::schema::{
    EnvVariable, HttpHeader, McpServer, McpServerHttp, McpServerStdio,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

const CREDENTIAL_SERVICE: &str = "ai.agentikz.studio.mcp";
static CONFIG_LOCK: Mutex<()> = Mutex::new(());
static SESSION_SECRETS: std::sync::LazyLock<Mutex<HashMap<String, String>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpValue {
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub value: String,
    #[serde(default)]
    pub secret: bool,
    #[serde(default)]
    pub stored: bool,
    #[serde(default)]
    pub session_only: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credential_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub transport: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub agent_ids: Vec<String>,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, McpValue>,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, McpValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpConfig {
    pub schema_version: u32,
    pub builtin_enabled: bool,
    pub servers: Vec<McpServerConfig>,
}

impl Default for McpConfig {
    fn default() -> Self {
        Self {
            schema_version: 1,
            builtin_enabled: true,
            servers: vec![],
        }
    }
}

pub fn validate_config(config: &McpConfig) -> Result<(), String> {
    if config.schema_version != 1 {
        return Err("不支持的 MCP 配置版本。".into());
    }
    if config.servers.len() > 50 {
        return Err("最多可配置 50 个 MCP 服务。".into());
    }
    let mut ids = HashSet::new();
    let mut names = HashSet::new();
    for server in &config.servers {
        if uuid::Uuid::parse_str(&server.id).is_err() || !ids.insert(&server.id) {
            return Err("MCP 服务 id 必须是唯一 UUID。".into());
        }
        if server.name.trim().is_empty()
            || server.name.len() > 64
            || !server
                .name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "_-".contains(c))
            || server.name.eq_ignore_ascii_case("agentikz")
            || !names.insert(server.name.to_lowercase())
        {
            return Err("服务标识须唯一，最多 64 个字符，仅包含英文字母、数字、下划线或短横线；agentikz 为内置名称。".into());
        }
        if server.agent_ids.iter().any(|id| {
            ![
                "claude-code",
                "codex-cli",
                "opencode",
                "gemini-cli",
                "cursor-agent",
                "kimi-code",
                "custom-acp",
            ]
            .contains(&id.as_str())
        }) {
            return Err("未知的适用 Agent。".into());
        }
        if server.args.len() > 128
            || server
                .args
                .iter()
                .any(|s| s.len() > 8192 || s.contains('\0'))
        {
            return Err("MCP 启动参数过长或包含无效字符。".into());
        }
        for (location, values) in [("env", &server.env), ("headers", &server.headers)] {
            if values.len() > 64 {
                return Err("环境变量或请求头最多 64 项。".into());
            }
            for (name, value) in values {
                if value
                    .credential_id
                    .as_ref()
                    .is_some_and(|id| uuid::Uuid::parse_str(id).is_err())
                {
                    return Err("敏感值引用无效。".into());
                }
                if name.is_empty()
                    || name.len() > 200
                    || name.contains(['\0', '\r', '\n', '='])
                    || value.value.len() > 8192
                    || value.value.contains('\0')
                {
                    return Err("环境变量或请求头包含无效名称或过长值。".into());
                }
                if location == "headers" {
                    agentikz_mcp::validate_headers(&HashMap::from([(
                        name.clone(),
                        value.value.clone(),
                    )]))?;
                }
            }
        }
        match server.transport.as_str() {
            "stdio"
                if !server.command.trim().is_empty()
                    && server.command.len() <= 8192
                    && !server.command.contains(['\0', '\r', '\n']) => {}
            "http" => agentikz_mcp::validate_http_url(&server.url)?,
            _ => return Err("请选择 stdio 或 Streamable HTTP，并填写连接参数。".into()),
        }
    }
    if serde_json::to_vec(config)
        .map_err(|_| "无法序列化 MCP 配置。")?
        .len()
        > 1024 * 1024
    {
        return Err("MCP 配置超过 1 MiB。".into());
    }
    Ok(())
}

fn config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("mcp/servers.json"))
}

fn read_at(path: &Path) -> Result<McpConfig, String> {
    if !path.exists() {
        return Ok(McpConfig::default());
    }
    if std::fs::metadata(path)
        .map_err(|_| "无法读取 MCP 配置。")?
        .len()
        > 2 * 1024 * 1024
    {
        return Err("MCP 配置文件过大。".into());
    }
    let config: McpConfig =
        serde_json::from_slice(&std::fs::read(path).map_err(|_| "无法读取 MCP 配置。")?)
            .map_err(|_| "MCP 配置损坏或版本不兼容；请检查应用数据目录的 mcp/servers.json。")?;
    validate_config(&config)?;
    Ok(config)
}

pub fn read_config(app: &AppHandle) -> Result<McpConfig, String> {
    let _lock = CONFIG_LOCK.lock().map_err(|_| "MCP 配置锁不可用。")?;
    read_at(&config_path(app)?)
}

fn credential_key(server: &str, location: &str, key: &str) -> String {
    format!("{server}/{location}/{key}")
}

fn storage_key(base: &str, value: &McpValue) -> String {
    match &value.credential_id {
        Some(id) => format!("{base}/{id}"),
        None => base.into(),
    }
}

fn resolve_values(
    server: &str,
    location: &str,
    values: &HashMap<String, McpValue>,
) -> Result<HashMap<String, String>, String> {
    values
        .iter()
        .map(|(name, value)| {
            let resolved = if value.secret {
                let key = storage_key(&credential_key(server, location, name), value);
                if value.session_only {
                    SESSION_SECRETS
                        .lock()
                        .map_err(|_| "临时凭据不可用。")?
                        .get(&key)
                        .cloned()
                        .ok_or("临时凭据已过期，请在 MCP 设置中重新填写。")?
                } else {
                    keyring::Entry::new(CREDENTIAL_SERVICE, &key)
                        .and_then(|entry| entry.get_password())
                        .map_err(|_| "无法读取 MCP 凭据，请重新填写或改用本次会话临时值。")?
                }
            } else {
                value.value.clone()
            };
            Ok((name.clone(), resolved))
        })
        .collect()
}

#[tauri::command]
pub async fn mcp_get_config(app: AppHandle) -> Result<McpConfig, String> {
    tokio::task::spawn_blocking(move || read_config(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn mcp_save_config(app: AppHandle, config: McpConfig) -> Result<McpConfig, String> {
    let enabled = config.builtin_enabled;
    let save_app = app.clone();
    let result = tokio::task::spawn_blocking(move || save_config(&save_app, config))
        .await
        .map_err(|e| e.to_string())??;
    if !enabled {
        super::bridge::revoke_all();
        super::external::stop_all(&app);
    }
    Ok(result)
}

fn save_config(app: &AppHandle, config: McpConfig) -> Result<McpConfig, String> {
    save_at(&config_path(app)?, config)
}

fn save_at(path: &Path, mut config: McpConfig) -> Result<McpConfig, String> {
    validate_config(&config)?;
    let _lock = CONFIG_LOCK.lock().map_err(|_| "MCP 配置锁不可用。")?;
    let old = read_at(path)?;
    let old_values: HashMap<String, McpValue> = old
        .servers
        .iter()
        .flat_map(|server| {
            [("env", &server.env), ("headers", &server.headers)]
                .into_iter()
                .flat_map(move |(loc, values)| {
                    values.iter().map(move |(name, value)| {
                        (credential_key(&server.id, loc, name), value.clone())
                    })
                })
        })
        .collect();
    let mut staged = Vec::new();
    for server in &mut config.servers {
        for (location, values) in [("env", &mut server.env), ("headers", &mut server.headers)] {
            for (name, value) in values {
                if !value.secret {
                    value.stored = false;
                    value.session_only = false;
                    value.credential_id = None;
                    continue;
                }
                let key = credential_key(&server.id, location, name);
                if value.value.is_empty() && value.stored {
                    let previous = old_values
                        .get(&key)
                        .ok_or("凭据引用无效，请重新填写敏感值。")?;
                    if !previous.secret
                        || previous.session_only != value.session_only
                        || previous.credential_id != value.credential_id
                    {
                        return Err("更改敏感值保存方式时请重新填写。".into());
                    }
                } else if value.value.is_empty() {
                    return Err(format!("请填写敏感值：{name}"));
                } else {
                    value.credential_id = Some(uuid::Uuid::new_v4().to_string());
                    staged.push((
                        storage_key(&key, value),
                        value.value.clone(),
                        value.session_only,
                    ));
                }
                value.value.clear();
                value.stored = true;
            }
        }
    }
    let mut rollback = Vec::new();
    for (key, value, temporary) in &staged {
        if *temporary {
            continue;
        }
        let entry = match keyring::Entry::new(CREDENTIAL_SERVICE, key) {
            Ok(entry) => entry,
            Err(_) => {
                restore_credentials(&rollback);
                return Err("系统凭据存储不可用；可选择本次会话临时值。".into());
            }
        };
        let previous = entry.get_password().ok();
        if entry.set_password(value).is_err() {
            restore_credentials(&rollback);
            return Err("系统凭据存储失败；可选择本次会话临时值。".into());
        }
        rollback.push((key.clone(), previous));
    }
    if let Err(error) = write_atomic(path, &config) {
        restore_credentials(&rollback);
        return Err(error);
    }
    let mut current = HashMap::new();
    for server in &config.servers {
        for (loc, values) in [("env", &server.env), ("headers", &server.headers)] {
            for (name, value) in values {
                current.insert(credential_key(&server.id, loc, name), value);
            }
        }
    }
    let mut secrets = SESSION_SECRETS.lock().map_err(|_| "临时凭据不可用。")?;
    for (key, value, temporary) in staged {
        if temporary {
            secrets.insert(key, value);
        }
    }
    for (key, old) in old_values {
        let new = current.get(&key);
        let same = new.is_some_and(|v| {
            v.secret && v.session_only == old.session_only && v.credential_id == old.credential_id
        });
        if old.secret && !same {
            let stored_key = storage_key(&key, &old);
            if old.session_only {
                secrets.remove(&stored_key);
            } else if let Ok(entry) = keyring::Entry::new(CREDENTIAL_SERVICE, &stored_key) {
                let _ = entry.delete_credential();
            }
        }
    }
    Ok(config)
}

fn restore_credentials(values: &[(String, Option<String>)]) {
    for (key, old) in values.iter().rev() {
        if let Ok(entry) = keyring::Entry::new(CREDENTIAL_SERVICE, key) {
            match old {
                Some(value) => {
                    let _ = entry.set_password(value);
                }
                None => {
                    let _ = entry.delete_credential();
                }
            }
        }
    }
}

fn write_atomic(path: &Path, config: &McpConfig) -> Result<(), String> {
    let dir = path.parent().ok_or("Invalid MCP config directory")?;
    std::fs::create_dir_all(dir).map_err(|_| "无法创建 MCP 配置目录。")?;
    let temporary = dir.join(format!("servers-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|_| "无法写入 MCP 配置。")?;
        file.write_all(&serde_json::to_vec_pretty(config).map_err(|_| "无法序列化 MCP 配置。")?)
            .and_then(|_| file.sync_all())
            .map_err(|_| "无法写入 MCP 配置。")?;
        std::fs::rename(&temporary, path).map_err(|_| "无法替换 MCP 配置。")?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temporary);
    }
    result
}

pub struct PreparedServer {
    name: String,
    http: bool,
    resolved: Result<McpServer, String>,
}

fn prepare_servers(config: &McpConfig, agent_id: &str) -> Vec<PreparedServer> {
    config
        .servers
        .iter()
        .filter(|s| {
            s.enabled && (s.agent_ids.is_empty() || s.agent_ids.iter().any(|a| a == agent_id))
        })
        .map(|s| PreparedServer {
            name: s.name.clone(),
            http: s.transport == "http",
            resolved: to_acp_server(s),
        })
        .collect()
}

pub fn prepare_session(
    app: &AppHandle,
    agent_id: &str,
) -> Result<(McpConfig, Vec<PreparedServer>), String> {
    let _lock = CONFIG_LOCK.lock().map_err(|_| "MCP 配置锁不可用。")?;
    let config = read_at(&config_path(app)?)?;
    let servers = prepare_servers(&config, agent_id);
    Ok((config, servers))
}

pub fn select_servers(
    prepared: Vec<PreparedServer>,
    http_supported: bool,
) -> Result<(Vec<McpServer>, Vec<String>), String> {
    let mut servers = Vec::new();
    let mut skipped = Vec::new();
    for server in prepared {
        if server.http && !http_supported {
            skipped.push(format!("{}：当前 Agent 未声明支持 HTTP MCP。", server.name));
        } else {
            servers.push(server.resolved?);
        }
    }
    Ok((servers, skipped))
}

fn to_acp_server(server: &McpServerConfig) -> Result<McpServer, String> {
    if server.transport == "stdio" {
        let executable = crate::acp::resolve_mcp_executable(&server.command)?;
        let env = resolve_values(&server.id, "env", &server.env)?
            .into_iter()
            .map(|(n, v)| EnvVariable::new(n, v))
            .collect();
        Ok(McpServer::Stdio(
            McpServerStdio::new(server.name.clone(), executable)
                .args(server.args.clone())
                .env(env),
        ))
    } else {
        let headers = resolve_values(&server.id, "headers", &server.headers)?
            .into_iter()
            .map(|(n, v)| HttpHeader::new(n, v))
            .collect();
        Ok(McpServer::Http(
            McpServerHttp::new(server.name.clone(), server.url.clone()).headers(headers),
        ))
    }
}

#[tauri::command]
pub async fn mcp_test_server(
    app: AppHandle,
    server_id: String,
) -> Result<Vec<super::ToolSpec>, String> {
    let server = tokio::task::spawn_blocking(move || {
        read_config(&app)?
            .servers
            .into_iter()
            .find(|s| s.id == server_id)
            .ok_or("MCP 服务不存在。".to_string())
    })
    .await
    .map_err(|_| "无法读取 MCP 配置。")??;
    if server.transport == "stdio" {
        let executable = crate::acp::resolve_mcp_executable(&server.command)?;
        agentikz_mcp::probe_stdio(
            &executable,
            &server.args,
            &resolve_values(&server.id, "env", &server.env)?,
        )
        .await
    } else {
        agentikz_mcp::probe_http(
            &server.url,
            &resolve_values(&server.id, "headers", &server.headers)?,
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server() -> McpServerConfig {
        McpServerConfig {
            id: uuid::Uuid::new_v4().to_string(),
            name: "test-server".into(),
            transport: "stdio".into(),
            enabled: false,
            agent_ids: vec![],
            command: std::env::current_exe().unwrap().to_string_lossy().into(),
            args: vec![],
            env: HashMap::new(),
            url: String::new(),
            headers: HashMap::new(),
        }
    }

    #[test]
    fn validates_configuration_and_filters_agent_capabilities() {
        let mut first = server();
        first.transport = "http".into();
        first.url = "https://example.org/mcp".into();
        first.enabled = true;
        first.agent_ids = vec!["codex-cli".into()];
        let mut config = McpConfig {
            servers: vec![first.clone()],
            ..Default::default()
        };
        validate_config(&config).unwrap();
        assert!(
            select_servers(prepare_servers(&config, "claude-code"), true)
                .unwrap()
                .0
                .is_empty()
        );
        assert_eq!(
            select_servers(prepare_servers(&config, "codex-cli"), false)
                .unwrap()
                .1
                .len(),
            1
        );
        assert_eq!(
            select_servers(prepare_servers(&config, "codex-cli"), true)
                .unwrap()
                .0
                .len(),
            1
        );
        config.servers.push(first);
        assert!(validate_config(&config).is_err());
        config.servers.pop();
        config.servers[0].url = "https://example.org/mcp?api_key=secret".into();
        assert!(validate_config(&config).is_err());
    }

    #[test]
    fn saves_secrets_as_references_preserves_them_and_cleans_deleted_values() {
        let root =
            std::env::temp_dir().join(format!("agentikz-mcp-config-{}", uuid::Uuid::new_v4()));
        let path = root.join("servers.json");
        let mut one = server();
        one.env.insert(
            "TOKEN".into(),
            McpValue {
                value: "test-private-value".into(),
                secret: true,
                session_only: true,
                stored: false,
                credential_id: None,
            },
        );
        let saved = save_at(
            &path,
            McpConfig {
                servers: vec![one],
                ..Default::default()
            },
        )
        .unwrap();
        assert!(!std::fs::read_to_string(&path)
            .unwrap()
            .contains("test-private-value"));
        assert_eq!(
            resolve_values(&saved.servers[0].id, "env", &saved.servers[0].env).unwrap()["TOKEN"],
            "test-private-value"
        );
        let saved = save_at(&path, saved).unwrap();
        assert!(saved.servers[0].env["TOKEN"].stored);
        let key = storage_key(
            &credential_key(&saved.servers[0].id, "env", "TOKEN"),
            &saved.servers[0].env["TOKEN"],
        );
        save_at(&path, McpConfig::default()).unwrap();
        assert!(!SESSION_SECRETS.lock().unwrap().contains_key(&key));
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(root).unwrap();
    }

    #[tokio::test]
    async fn discovers_http_tools_with_headers_and_legacy_initialization() {
        use axum::{
            extract::Json,
            http::{HeaderMap, StatusCode},
            routing::post,
            Router,
        };
        use serde_json::{json, Value};
        async fn handle(
            headers: HeaderMap,
            Json(request): Json<Value>,
        ) -> (StatusCode, Json<Value>) {
            if headers.get("authorization").and_then(|v| v.to_str().ok())
                != Some("Bearer integration-secret")
            {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({"error":"Unauthorized"})),
                );
            }
            let id = request.get("id").cloned().unwrap_or(Value::Null);
            let response = match request["method"].as_str() {
                Some("initialize") => {
                    json!({"protocolVersion":"2025-11-25","capabilities":{"tools":{}},"serverInfo":{"name":"test-http","version":"1"}})
                }
                Some("tools/list") => {
                    json!({"tools":[{"name":"echo","description":"Fixture","inputSchema":{"type":"object"}}]})
                }
                _ => return (StatusCode::ACCEPTED, Json(Value::Null)),
            };
            (
                StatusCode::OK,
                Json(json!({"jsonrpc":"2.0","id":id,"result":response})),
            )
        }
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/mcp", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            axum::serve(listener, Router::new().route("/mcp", post(handle)))
                .await
                .unwrap();
        });
        let headers = HashMap::from([("authorization".into(), "Bearer integration-secret".into())]);
        let result = agentikz_mcp::probe_http(&url, &headers).await;
        let unauthorized = agentikz_mcp::probe_http(&url, &HashMap::new()).await;
        task.abort();
        assert_eq!(result.unwrap()[0].name, "echo");
        assert!(unauthorized.is_err());
        assert!(!unauthorized.unwrap_err().contains("integration-secret"));
    }
}
