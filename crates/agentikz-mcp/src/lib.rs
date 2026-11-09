pub mod manifest;

use manifest::{builtin_tools, ToolSpec};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use rmcp::{
    model::*,
    service::{RequestContext, RoleServer},
    transport::{
        streamable_http_client::StreamableHttpClientTransportConfig, StreamableHttpClientTransport,
        TokioChildProcess,
    },
    ErrorData, ServerHandler, ServiceExt,
};
use serde_json::{json, Value};
use std::{collections::HashMap, path::Path, process::Stdio, time::Duration};
use tokio::process::Command;

#[derive(Clone)]
pub struct CanvasBridge {
    client: reqwest::Client,
    endpoint: String,
    token: String,
}

impl CanvasBridge {
    pub fn new(endpoint: String, token: String) -> Result<Self, String> {
        let url = reqwest::Url::parse(&endpoint).map_err(|_| "Invalid bridge URL")?;
        if url.scheme() != "http"
            || url.host_str() != Some("127.0.0.1")
            || url.port().is_none()
            || url.path() != "/call"
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err("The canvas bridge requires a loopback HTTP endpoint.".into());
        }
        if token.len() < 32 {
            return Err("Missing canvas bridge authorization.".into());
        }
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(155))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            client,
            endpoint,
            token,
        })
    }
}

impl ServerHandler for CanvasBridge {
    fn get_info(&self) -> ServerConfig {
        let mut config = ServerConfig::new(ServerCapabilities::builder().enable_tools().build());
        config.server_info = Implementation::new("AgenTikZ", env!("CARGO_PKG_VERSION"));
        config.instructions = Some("Use get_project_context to discover project files and read_project_file before proposing manuscript changes. Use get_canvas_source before canvas edits. Use render_canvas_preview to compile an exact figure draft and inspect its image before refining. All proposals require user review; previewing does not apply edits or validate manuscript builds.".into());
        config
    }

    async fn list_tools(
        &self,
        _: Option<PaginatedRequestParams>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        Ok(ListToolsResult::with_all_items(
            builtin_tools()
                .into_iter()
                .map(ToolSpec::into_tool)
                .collect(),
        ))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        if !builtin_tools()
            .iter()
            .any(|tool| tool.name == request.name.as_ref())
        {
            return Err(ErrorData::invalid_params("Unknown AgenTikZ tool", None));
        }
        let send = self.client.post(&self.endpoint).bearer_auth(&self.token)
            .json(&json!({"toolName":request.name, "arguments":request.arguments.unwrap_or_default()}))
            .send();
        let response = tokio::select! {
            _ = context.ct.cancelled() => return Ok(CallToolResult::structured_error(json!({"code":"cancelled"})).into()),
            response = send => response.map_err(|_| ErrorData::internal_error("Canvas bridge unavailable or timed out", None))?,
        };
        if !response.status().is_success() {
            return Ok(CallToolResult::structured_error(json!({
                "code":"bridge_unavailable", "message":"The canvas request ended, was disabled, or is unavailable."
            })).into());
        }
        let body: Value = response
            .json()
            .await
            .map_err(|_| ErrorData::internal_error("Invalid canvas bridge response", None))?;
        Ok(bridge_tool_result(body).into())
    }
}

/// Pixels must be an MCP image content block, not a base64 string inside JSON text.
pub fn bridge_tool_result(mut body: Value) -> CallToolResult {
    let image = body.as_object_mut().and_then(|object| object.remove("image"));
    if body.get("error").is_some() {
        return CallToolResult::structured_error(body);
    }
    let mut result = CallToolResult::structured(body);
    if let Some(image) = image {
        if let (Some(data), Some("image/png")) = (image["data"].as_str(), image["mimeType"].as_str()) {
            result.content.push(ContentBlock::image(data, "image/png"));
        }
    }
    result
}

pub async fn run_stdio() -> Result<(), String> {
    let endpoint = std::env::var("AGENTIKZ_MCP_ENDPOINT").map_err(|_| "Missing bridge endpoint")?;
    let token = std::env::var("AGENTIKZ_MCP_TOKEN").map_err(|_| "Missing bridge token")?;
    let service = CanvasBridge::new(endpoint, token)?
        .serve(rmcp::transport::stdio())
        .await
        .map_err(|_| "Cannot start MCP stdio transport")?;
    service
        .waiting()
        .await
        .map_err(|_| "MCP stdio transport failed")?;
    Ok(())
}

fn tool_specs(tools: Vec<Tool>) -> Vec<ToolSpec> {
    tools
        .into_iter()
        .map(|tool| ToolSpec {
            name: tool.name.into_owned(),
            description: tool.description.map(|s| s.into_owned()).unwrap_or_default(),
            input_schema: Value::Object((*tool.input_schema).clone()),
        })
        .collect()
}

pub async fn probe_stdio(
    command: &Path,
    args: &[String],
    env: &HashMap<String, String>,
) -> Result<Vec<ToolSpec>, String> {
    let mut command_builder = Command::new(command);
    command_builder
        .args(args)
        .envs(env)
        .kill_on_drop(true)
        .stderr(Stdio::null());
    #[cfg(windows)]
    command_builder.creation_flags(0x0800_0000);
    let transport = TokioChildProcess::new(command_builder)
        .map_err(|_| "Cannot start MCP process. Check command and arguments.")?;
    let operation = async {
        let service = ()
            .serve(transport)
            .await
            .map_err(|_| "MCP handshake failed. Check command, runtime and authentication.")?;
        let result = tokio::time::timeout(Duration::from_secs(10), service.list_all_tools()).await;
        let _ = tokio::time::timeout(Duration::from_secs(4), service.cancel()).await;
        result
            .map_err(|_| "MCP tool discovery timed out")?
            .map(tool_specs)
            .map_err(|_| "MCP tool discovery failed".into())
    };
    tokio::time::timeout(Duration::from_secs(30), operation)
        .await
        .map_err(|_| "MCP handshake timed out".to_string())?
}

pub async fn probe_http(
    url: &str,
    headers: &HashMap<String, String>,
) -> Result<Vec<ToolSpec>, String> {
    let mut parsed_headers = HashMap::new();
    for (name, value) in headers {
        let name =
            HeaderName::from_bytes(name.as_bytes()).map_err(|_| "Invalid HTTP header name")?;
        let value = HeaderValue::from_str(value).map_err(|_| "Invalid HTTP header value")?;
        parsed_headers.insert(name, value);
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|_| "Cannot initialize HTTP client")?;
    let config = StreamableHttpClientTransportConfig::with_uri(url.to_string())
        .custom_headers(parsed_headers);
    let transport = StreamableHttpClientTransport::with_client(client, config);
    let operation = async {
        let service = ()
            .serve(transport)
            .await
            .map_err(|_| "MCP HTTP handshake failed. Check endpoint, headers and Agent support.")?;
        let result = tokio::time::timeout(Duration::from_secs(10), service.list_all_tools()).await;
        let _ = tokio::time::timeout(Duration::from_secs(3), service.cancel()).await;
        result
            .map_err(|_| "MCP tool discovery timed out")?
            .map(tool_specs)
            .map_err(|_| "MCP tool discovery failed".into())
    };
    tokio::time::timeout(Duration::from_secs(30), operation)
        .await
        .map_err(|_| "MCP HTTP handshake timed out".to_string())?
}

pub async fn probe_builtin(
    command: &Path,
    env: &HashMap<String, String>,
) -> Result<Vec<ToolSpec>, String> {
    let mut process = Command::new(command);
    process.envs(env).kill_on_drop(true).stderr(Stdio::null());
    #[cfg(windows)]
    process.creation_flags(0x0800_0000);
    let transport = TokioChildProcess::new(process).map_err(|_| "无法启动内置 MCP。")?;
    tokio::time::timeout(Duration::from_secs(35), async {
        let service = ().serve(transport).await.map_err(|_| "内置 MCP 握手失败。")?;
        let result = async {
            let tools = service
                .list_all_tools()
                .await
                .map_err(|_| "内置 MCP 工具发现失败。")?;
            let call = service
                .call_tool(CallToolRequestParams::new("get_canvas_source"))
                .await
                .map_err(|_| "内置 MCP 画布读取失败。")?;
            if call.is_error == Some(true) {
                return Err("内置 MCP 无法读取当前画布，请确认窗口仍然可用。".into());
            }
            Ok(tool_specs(tools))
        }
        .await;
        let _ = tokio::time::timeout(Duration::from_secs(3), service.cancel()).await;
        result
    })
    .await
    .map_err(|_| "内置 MCP 测试超时。".to_string())?
}

pub fn validate_http_url(value: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(value).map_err(|_| "请输入完整的 HTTP(S) MCP 地址。")?;
    let sensitive_query = url.query_pairs().any(|(key, _)| {
        [
            "token",
            "access_token",
            "api_key",
            "apikey",
            "key",
            "auth",
            "authorization",
            "password",
            "secret",
            "client_secret",
        ]
        .contains(&key.to_lowercase().as_str())
    });
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || sensitive_query
    {
        return Err("MCP 地址须使用 HTTP(S)，鉴权信息请填写在敏感请求头中；不支持地址中的密码、密钥或片段。".into());
    }
    Ok(())
}

pub fn validate_headers(headers: &HashMap<String, String>) -> Result<(), String> {
    let mut parsed = HeaderMap::new();
    for (name, value) in headers {
        parsed.insert(
            HeaderName::from_bytes(name.as_bytes()).map_err(|_| "请求头名称无效。")?,
            HeaderValue::from_str(value).map_err(|_| "请求头值无效。")?,
        );
    }
    Ok(())
}
