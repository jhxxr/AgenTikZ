use serde::Serialize;
use serde_json::{json, Value};

#[derive(Debug, Serialize)]
pub struct McpToolSpec {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

/// Exposes AgentTikZ's built-in MCP Server tools for external & local ACP agents
#[tauri::command]
pub fn mcp_get_manifest() -> Vec<McpToolSpec> {
    vec![
        McpToolSpec {
            name: "get_canvas_ast".into(),
            description: "Returns the lossless CST/AST of the active TikZ canvas including nodes, edges, 3D cuboids, PGFPlots axes, and character SourceSpans.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
        },
        McpToolSpec {
            name: "get_selected_elements".into(),
            description: "Returns the currently selected canvas elements (@selection) and their exact TikZ code spans.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
        },
        McpToolSpec {
            name: "propose_tikz_patch".into(),
            description: "Proposes a clean, surgical TikZ code patch preserving all user comments and \\tikzset styles.".into(),
            input_schema: json!({
                "type": "object",
                "required": ["summary", "newTikzCode"],
                "properties": {
                    "summary": { "type": "string" },
                    "rationale": { "type": "string" },
                    "newTikzCode": { "type": "string" }
                }
            }),
        },
    ]
}
