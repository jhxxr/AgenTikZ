use agent_client_protocol::v1::schema::{
    NewSessionResponse, SessionConfigOption, SessionConfigValueId, SessionId,
    SetSessionConfigOptionRequest,
};
use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::Agent;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelState {
    pub models: Vec<ModelChoice>,
    pub current_model_id: Option<String>,
    #[serde(default)]
    pub thought_levels: Vec<ModelChoice>,
    pub current_thought_level: Option<String>,
    #[serde(skip)]
    pub config_id: Option<String>,
    #[serde(skip)]
    pub thought_config_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelChoice {
    pub id: String,
    pub name: String,
}

fn append_choices(options: &Value, target: &mut Vec<ModelChoice>) {
    if let Some(items) = options.as_array() {
        for item in items {
            if let Some(id) = item["value"].as_str() {
                if !target.iter().any(|choice| choice.id == id) {
                    target.push(ModelChoice {
                        id: id.into(),
                        name: item["name"].as_str().unwrap_or(id).into(),
                    });
                }
            } else {
                append_choices(&item["options"], target);
            }
        }
    }
}

pub fn from_config(options: Option<&[SessionConfigOption]>) -> ModelState {
    let Some(options) = options else {
        return ModelState::default();
    };
    let options = serde_json::to_value(options).unwrap_or_default();
    let Some(items) = options.as_array() else {
        return ModelState::default();
    };
    let mut state = ModelState::default();
    if let Some(option) = items.iter().find(|item| {
        item["type"] == "select" && (item["category"] == "model" || item["id"] == "model")
    }) {
        state.config_id = option["id"].as_str().map(str::to_owned);
        state.current_model_id = option["currentValue"].as_str().map(str::to_owned);
        append_choices(&option["options"], &mut state.models);
    }
    if let Some(thought) = items.iter().find(|item| {
        item["type"] == "select"
            && (item["category"] == "thought_level"
                || matches!(
                    item["id"].as_str(),
                    Some("effort" | "reasoning_effort" | "thinking_level" | "thought_level")
                ))
    }) {
        state.thought_config_id = thought["id"].as_str().map(str::to_owned);
        state.current_thought_level = thought["currentValue"].as_str().map(str::to_owned);
        append_choices(&thought["options"], &mut state.thought_levels);
    }
    state
}

pub fn selection_request(
    session_id: SessionId,
    state: &ModelState,
    requested: Option<&str>,
) -> Result<Option<SetSessionConfigOptionRequest>, String> {
    let Some(id) = requested.filter(|id| !id.is_empty()) else {
        return Ok(None);
    };
    let config_id = state
        .config_id
        .as_deref()
        .ok_or("当前 ACP Agent 未提供模型选择能力，请清除已保存的模型选择或更新适配器。")?;
    if !state.models.iter().any(|model| model.id == id) {
        return Err(format!(
            "ACP Agent 当前不提供所选模型「{id}」，请重新连接并选择模型。"
        ));
    }
    Ok(Some(SetSessionConfigOptionRequest::new(
        session_id,
        config_id.to_string(),
        SessionConfigValueId::new(id.to_string()),
    )))
}

pub fn thought_selection_request(
    session_id: SessionId,
    state: &ModelState,
    requested: Option<&str>,
) -> Result<Option<SetSessionConfigOptionRequest>, String> {
    let Some(id) = requested.filter(|id| !id.is_empty()) else {
        return Ok(None);
    };
    let config_id = state.thought_config_id.as_deref().ok_or_else(|| {
        format!(
            "当前 ACP Agent 或所选模型未提供思考强度调节能力，无法设置为「{id}」；请将思考强度切回「跟随默认」。"
        )
    })?;
    if !state.thought_levels.iter().any(|level| level.id == id) {
        let available = state
            .thought_levels
            .iter()
            .map(|level| level.id.as_str())
            .collect::<Vec<_>>()
            .join(" / ");
        return Err(format!(
            "当前模型不支持思考强度「{id}」（可用档位：{}），请在模型旁切换思考强度或选为「跟随默认」。",
            if available.is_empty() { "无" } else { &available }
        ));
    }
    Ok(Some(SetSessionConfigOptionRequest::new(
        session_id,
        config_id.to_string(),
        SessionConfigValueId::new(id.to_string()),
    )))
}

#[cfg(test)]
pub async fn apply_selection(
    connection: &ConnectionTo<Agent>,
    session: &NewSessionResponse,
    requested: Option<&str>,
) -> Result<ModelState, agent_client_protocol::Error> {
    apply_selections(connection, session, requested, None).await
}

pub async fn apply_selections(
    connection: &ConnectionTo<Agent>,
    session: &NewSessionResponse,
    requested_model: Option<&str>,
    requested_thought: Option<&str>,
) -> Result<ModelState, agent_client_protocol::Error> {
    let mut state = from_config(session.config_options.as_deref());
    // Always confirm an explicit selection, even if the initial value matches:
    // a permission-mode change can also alter the agent's model configuration.
    if let Some(request) =
        selection_request(session.session_id.clone(), &state, requested_model)
            .map_err(|error| super::protocol_error(&error))?
    {
        let selected = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            connection.send_request(request).block_task(),
        )
        .await
        .map_err(|_| super::protocol_error("ACP 模型切换超时 (30s)"))??;
        state = from_config(Some(&selected.config_options));
        if state.current_model_id.as_deref() != requested_model.filter(|s| !s.is_empty()) {
            return Err(super::protocol_error(
                "ACP Agent 未确认所选模型，请重新连接；本轮未发送提示词。",
            ));
        }
    }
    if let Some(request) =
        thought_selection_request(session.session_id.clone(), &state, requested_thought)
            .map_err(|error| super::protocol_error(&error))?
    {
        let selected = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            connection.send_request(request).block_task(),
        )
        .await
        .map_err(|_| super::protocol_error("ACP 思考强度切换超时 (30s)"))??;
        state = from_config(Some(&selected.config_options));
        if state.current_thought_level.as_deref() != requested_thought.filter(|s| !s.is_empty()) {
            return Err(super::protocol_error(
                "ACP Agent 未确认所选思考强度，请切换为其他档位或选为「跟随默认」；本轮未发送提示词。",
            ));
        }
    }
    Ok(state)
}

pub fn explain_error(error: &str) -> String {
    if error.contains("cross-format conversion") && error.contains("context_management") {
        format!("模型渠道不兼容：Claude Code 发送的 context_management 不被当前跨格式 API 网关支持。\
            请将 Claude Code 切换到原生 Anthropic 上游，或使用内置 Pi 配置该渠道真实支持的 API 协议、URL 与模型。\
            ACP 握手成功不代表模型 API 可用；重试或修改画布无法修复此错误。\n\n原始错误：{error}")
    } else {
        error.into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn options() -> Vec<SessionConfigOption> {
        serde_json::from_value(json!([
            {"id":"effort","name":"Effort","category":"thought_level","type":"select","currentValue":"high",
             "options":[{"value":"low","name":"Low"},{"value":"high","name":"High"}]},
            {"id":"model-choice","name":"Model","category":"model","type":"select","currentValue":"one",
             "options":[{"group":"provider","name":"Provider","options":[{"value":"one","name":"One"},{"value":"two","name":"Two"}]}]}
        ])).unwrap()
    }

    #[test]
    fn extracts_grouped_models_and_thought_levels_and_rejects_unsupported_selection() {
        let options = options();
        let state = from_config(Some(&options));
        assert_eq!(state.models.len(), 2);
        assert_eq!(state.models[1].id, "two");
        assert_eq!(state.thought_levels.len(), 2);
        assert_eq!(state.current_thought_level.as_deref(), Some("high"));
        let session = SessionId::new("fixture");
        assert!(selection_request(session.clone(), &state, Some("one"))
            .unwrap()
            .is_some());
        assert!(selection_request(session.clone(), &state, None)
            .unwrap()
            .is_none());
        let request = selection_request(session.clone(), &state, Some("two"))
            .unwrap()
            .unwrap();
        let wire = serde_json::to_value(request).unwrap();
        assert_eq!(wire["configId"], "model-choice");
        assert_eq!(wire["value"], "two");

        let thought_req = thought_selection_request(session.clone(), &state, Some("low"))
            .unwrap()
            .unwrap();
        let thought_wire = serde_json::to_value(thought_req).unwrap();
        assert_eq!(thought_wire["configId"], "effort");
        assert_eq!(thought_wire["value"], "low");
        assert!(thought_selection_request(session.clone(), &state, Some("xhigh")).is_err());
        assert!(thought_selection_request(session.clone(), &state, None).unwrap().is_none());

        assert!(selection_request(session.clone(), &state, Some("missing")).is_err());
        assert!(selection_request(session, &ModelState::default(), Some("two")).is_err());
        assert!(from_config(None).models.is_empty());
    }

    #[test]
    fn provides_actionable_gateway_diagnostics_without_changing_other_errors() {
        assert!(
            explain_error("400 cross-format conversion does not support context_management")
                .contains("原生 Anthropic")
        );
        assert_eq!(
            explain_error("Authentication failed"),
            "Authentication failed"
        );
    }

    #[tokio::test]
    async fn real_acp_transport_applies_models_before_prompt_and_stops_on_unconfirmed_selection() {
        use agent_client_protocol::v1::schema::{
            ContentBlock, InitializeRequest, NewSessionRequest, PromptRequest, TextContent,
        };
        use agent_client_protocol::{schema::ProtocolVersion, AcpAgent, AcpAgentConfig, Client};
        for (scenario, requested, succeeds, sets_model) in [
            ("success", Some("two"), true, true),
            ("same-initial-value", Some("one"), true, true),
            ("default", None, true, false),
            ("unconfirmed", Some("two"), false, true),
            ("unsupported", Some("two"), false, false),
            ("stale", Some("deleted"), false, false),
        ] {
            let log = std::env::temp_dir()
                .join(format!("agentikz-acp-model-{}.log", uuid::Uuid::new_v4()));
            let node = super::super::resolve_mcp_executable("node").unwrap();
            let config = AcpAgentConfig::new(node).args([
                "--input-type=commonjs".to_string(),
                "-e".into(),
                include_str!("../../tests/fixtures/acp-model-agent.mjs").into(),
                scenario.into(),
                log.to_string_lossy().into_owned(),
            ]);
            let result = tokio::time::timeout(
                std::time::Duration::from_secs(15),
                Client.v1().connect_with(
                    AcpAgent::new(config),
                    async move |connection: ConnectionTo<Agent>| {
                        connection
                            .send_request(InitializeRequest::new(ProtocolVersion::V1))
                            .block_task()
                            .await?;
                        let session = connection
                            .send_request(NewSessionRequest::new(std::env::temp_dir()))
                            .block_task()
                            .await?;
                        apply_selection(&connection, &session, requested).await?;
                        connection
                            .send_request(PromptRequest::new(
                                session.session_id,
                                vec![ContentBlock::Text(TextContent::new("Test only"))],
                            ))
                            .block_task()
                            .await?;
                        Ok(())
                    },
                ),
            )
            .await
            .unwrap();
            assert_eq!(result.is_ok(), succeeds, "{scenario}: {result:?}");
            let calls = std::fs::read_to_string(&log).unwrap();
            std::fs::remove_file(&log).unwrap();
            assert_eq!(
                calls.contains("session/set_config_option"),
                sets_model,
                "{scenario}"
            );
            assert_eq!(calls.contains("session/prompt"), succeeds, "{scenario}");
            if succeeds && sets_model {
                assert!(
                    calls.find("session/set_config_option").unwrap()
                        < calls.find("session/prompt").unwrap()
                );
            }
        }
    }
}
