use serde::{Deserialize, Serialize};
use serde_json::json;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentProbeResult {
    pub id: String,
    pub detected: bool,
    pub version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AcpPromptResponse {
    #[serde(rename = "usedNativeCli")]
    pub used_native_cli: bool,
    pub thought: Option<String>,
    pub reply: Option<String>,
    #[serde(rename = "proposedTikz")]
    pub proposed_tikz: Option<String>,
}

fn check_cli_exists(bin: &str) -> bool {
    let checker = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    std::process::Command::new(checker)
        .arg(bin)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn acp_probe_agents() -> Vec<AgentProbeResult> {
    let has_npx = check_cli_exists("npx");
    let has_opencode = check_cli_exists("opencode");
    let has_gemini = check_cli_exists("gemini");

    vec![
        AgentProbeResult {
            id: "claude-code".into(),
            detected: has_npx || check_cli_exists("claude"),
            version: Some("ACP v0.4 · BYOA".into()),
        },
        AgentProbeResult {
            id: "opencode".into(),
            detected: has_opencode || has_npx,
            version: Some("opencode acp · BYOA".into()),
        },
        AgentProbeResult {
            id: "codex-cli".into(),
            detected: has_npx || check_cli_exists("codex"),
            version: Some("codex-acp · BYOA".into()),
        },
        AgentProbeResult {
            id: "gemini-cli".into(),
            detected: has_gemini || has_npx,
            version: Some("gemini --acp · BYOA".into()),
        },
    ]
}

/// Spawns an Agent Client Protocol (ACP) JSON-RPC 2.0 over stdio session
/// following the Agentero BYOA architecture.
#[tauri::command]
pub async fn acp_send_prompt(
    agent_id: String,
    prompt: String,
    canvas_tikz: String,
    selected_ids: Vec<String>,
) -> Result<AcpPromptResponse, String> {
    let (program, args): (String, Vec<String>) = match agent_id.as_str() {
        "claude-code" => {
            if check_cli_exists("claude") {
                ("claude".into(), vec!["--acp".into()])
            } else if check_cli_exists("npx") {
                ("npx".into(), vec!["-y".into(), "@agentclientprotocol/claude-agent-acp".into()])
            } else {
                return Ok(AcpPromptResponse {
                    used_native_cli: false, thought: None, reply: None, proposed_tikz: None,
                });
            }
        }
        "opencode" => {
            if check_cli_exists("opencode") {
                ("opencode".into(), vec!["acp".into()])
            } else {
                return Ok(AcpPromptResponse {
                    used_native_cli: false, thought: None, reply: None, proposed_tikz: None,
                });
            }
        }
        "codex-cli" => {
            if check_cli_exists("codex") {
                ("codex".into(), vec!["--acp".into()])
            } else if check_cli_exists("npx") {
                ("npx".into(), vec!["-y".into(), "@zed-industries/codex-acp".into()])
            } else {
                return Ok(AcpPromptResponse {
                    used_native_cli: false, thought: None, reply: None, proposed_tikz: None,
                });
            }
        }
        "gemini-cli" => {
            if check_cli_exists("gemini") {
                ("gemini".into(), vec!["--acp".into()])
            } else {
                return Ok(AcpPromptResponse {
                    used_native_cli: false, thought: None, reply: None, proposed_tikz: None,
                });
            }
        }
        "custom-acp" => {
            // Custom agent requires the binary to be in PATH
            ("custom-agent-acp".into(), vec!["--stdio".into()])
        }
        _ => {
            return Ok(AcpPromptResponse {
                used_native_cli: false, thought: None, reply: None, proposed_tikz: None,
            });
        }
    };

    let mut child = match Command::new(&program)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(_) => {
            return Ok(AcpPromptResponse {
                used_native_cli: false, thought: None, reply: None, proposed_tikz: None,
            })
        }
    };

    let mut stdin = child.stdin.take().ok_or("Failed to open ACP stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open ACP stdout")?;
    let mut reader = BufReader::new(stdout).lines();

    // 1. Send ACP JSON-RPC 2.0 `initialize` request
    let init_req = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "0.4.0",
            "clientInfo": {
                "name": "AgentTikZ",
                "version": "0.1.0"
            },
            "capabilities": {
                "mcp": true
            }
        }
    });
    let init_line = format!("{}\n", init_req);
    stdin.write_all(init_line.as_bytes()).await.map_err(|e| format!("ACP stdin write failed: {e}"))?;
    stdin.flush().await.map_err(|e| format!("ACP stdin flush failed: {e}"))?;

    // Wait for the initialize response (id: 1) before proceeding
    let init_wait = timeout(Duration::from_secs(15), async {
        while let Ok(Some(line)) = reader.next_line().await {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                if val.get("id").and_then(|v| v.as_u64()) == Some(1) {
                    return true;
                }
            }
        }
        false
    })
    .await;

    if init_wait.unwrap_or(false) == false {
        let _ = child.kill().await;
        return Ok(AcpPromptResponse {
            used_native_cli: false, thought: None, reply: None, proposed_tikz: None,
        });
    }

    // 2. Send ACP `session/prompt` with local canvas & selection context
    let structured_prompt = format!(
        "You are assisting in AgentTikZ (Publication-grade TikZ Editor).\nSelected Element IDs: {:?}\nCurrent TikZ Code:\n```latex\n{}\n```\nUser Instruction: {}\nRespond with clean, semantic TikZ code preserving existing comments.",
        selected_ids, canvas_tikz, prompt
    );
    let prompt_req = json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "session/prompt",
        "params": {
            "prompt": structured_prompt
        }
    });
    let prompt_line = format!("{}\n", prompt_req);
    stdin.write_all(prompt_line.as_bytes()).await.map_err(|e| format!("ACP stdin write failed: {e}"))?;
    stdin.flush().await.map_err(|e| format!("ACP stdin flush failed: {e}"))?;

    // Collect JSON-RPC response lines with a generous timeout for LLM agents
    let mut collected_text = String::new();
    let read_res = timeout(Duration::from_secs(120), async {
        while let Ok(Some(line)) = reader.next_line().await {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                // Collect streaming chunks or final result text
                if let Some(chunk) = val
                    .pointer("/params/chunk")
                    .or_else(|| val.pointer("/result/text"))
                    .and_then(|v| v.as_str())
                {
                    collected_text.push_str(chunk);
                }
                // Break early on the final response (id: 2)
                if val.get("id").and_then(|v| v.as_u64()) == Some(2) && val.get("result").is_some() {
                    break;
                }
            }
        }
    })
    .await;

    let _ = child.kill().await;

    if read_res.is_ok() && !collected_text.trim().is_empty() {
        Ok(AcpPromptResponse {
            used_native_cli: true,
            thought: Some("ACP JSON-RPC 2.0 over stdio session completed.".into()),
            reply: Some(collected_text),
            proposed_tikz: None,
        })
    } else {
        Ok(AcpPromptResponse {
            used_native_cli: false, thought: None, reply: None, proposed_tikz: None,
        })
    }
}
