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
    #[serde(skip)]
    pub config_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelChoice {
    pub id: String,
    pub name: String,
}

pub fn from_config(options: Option<&[SessionConfigOption]>) -> ModelState {
    let Some(options) = options else {
        return ModelState::default();
    };
    // Read only the model selector. Other select options may describe permission modes
    // or reasoning effort; they must never appear in the model dropdown.
    let options = serde_json::to_value(options).unwrap_or_default();
    let Some(option) = options.as_array().and_then(|items| {
        items.iter().find(|item| {
            item["type"] == "select" && (item["category"] == "model" || item["id"] == "model")
        })
    }) else {
        return ModelState::default();
    };
    let mut state = ModelState {
        config_id: option["id"].as_str().map(str::to_owned),
        current_model_id: option["currentValue"].as_str().map(str::to_owned),
        ..Default::default()
    };
    fn append(options: &Value, models: &mut Vec<ModelChoice>) {
        if let Some(items) = options.as_array() {
            for item in items {
                if let Some(id) = item["value"].as_str() {
                    if !models.iter().any(|model| model.id == id) {
                        models.push(ModelChoice {
                            id: id.into(),
                            name: item["name"].as_str().unwrap_or(id).into(),
                        });
                    }
                } else {
                    append(&item["options"], models);
                }
            }
        }
    }
    append(&option["options"], &mut state.models);
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

pub async fn apply_selection(
    connection: &ConnectionTo<Agent>,
    session: &NewSessionResponse,
    requested: Option<&str>,
) -> Result<ModelState, agent_client_protocol::Error> {
    let mut state = from_config(session.config_options.as_deref());
    // Always confirm an explicit selection, even if the initial value matches:
    // a permission-mode change can also alter the agent's model configuration.
    if let Some(request) = selection_request(session.session_id.clone(), &state, requested)
        .map_err(|error| super::protocol_error(&error))?
    {
        let selected = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            connection.send_request(request).block_task(),
        )
        .await
        .map_err(|_| super::protocol_error("ACP 模型切换超时 (30s)"))??;
        state = from_config(Some(&selected.config_options));
        if state.current_model_id.as_deref() != requested {
            return Err(super::protocol_error(
                "ACP Agent 未确认所选模型，请重新连接；本轮未发送提示词。",
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
             "options":[{"value":"high","name":"High"}]},
            {"id":"model-choice","name":"Model","category":"model","type":"select","currentValue":"one",
             "options":[{"group":"provider","name":"Provider","options":[{"value":"one","name":"One"},{"value":"two","name":"Two"}]}]}
        ])).unwrap()
    }

    #[test]
    fn extracts_grouped_models_and_rejects_stale_or_unsupported_selection() {
        let options = options();
        let state = from_config(Some(&options));
        assert_eq!(state.models.len(), 2);
        assert_eq!(state.models[1].id, "two");
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
