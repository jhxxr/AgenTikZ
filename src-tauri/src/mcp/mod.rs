use serde::Serialize;
use serde_json::{json, Value};

#[derive(Debug, Serialize)]
pub struct McpToolSpec {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

/// Exposes AgenTikZ's built-in MCP Server tools for external & local ACP agents
#[tauri::command]
pub fn mcp_get_manifest() -> Vec<McpToolSpec> {
    vec![
        McpToolSpec {
            name: "get_canvas_ast".into(),
            description: "Returns the lossless CST/AST of the active TikZ canvas including nodes, edges, 3D cuboids, PGFPlots axes, bounding boxes, and character SourceSpans.".into(),
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
            name: "inspect_layout_diagnostics".into(),
            description: "Analyzes 2D bounding-box collisions, vertical arrow clearances, container overflows, borderless label boxes, and theme color consistency (0-100 layout health score).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "themeId": { "type": "string", "description": "Active journal theme ID (neurips, cvpr, nature, ieee)" }
                }
            }),
        },
        McpToolSpec {
            name: "get_component_library".into(),
            description: "Returns AgenTikZ's canonical building blocks (mha_block, addnorm_block, dl_block, conv_block, feature_cube, op_circle, stage_box, subcaption, and PGFPlots templates).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "category": { "type": "string", "description": "Optional category filter: neural, tensor3d, operators, containers, charts" }
                }
            }),
        },
        McpToolSpec {
            name: "get_theme_palette".into(),
            description: "Returns the active journal theme's semantic color tokens (attention, backbone, norm, embedding, output, container) for harmonious academic styling.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "themeId": { "type": "string" }
                }
            }),
        },
        McpToolSpec {
            name: "apply_surgical_diff".into(),
            description: "Applies localized SEARCH/REPLACE diff blocks or node-level AST patches to the current TikZ canvas while preserving unrelated user nodes, comments, and styles.".into(),
            input_schema: json!({
                "type": "object",
                "required": ["patches"],
                "properties": {
                    "patches": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["search", "replace"],
                            "properties": {
                                "search": { "type": "string" },
                                "replace": { "type": "string" }
                            }
                        }
                    }
                }
            }),
        },
        McpToolSpec {
            name: "auto_repair_layout".into(),
            description: "Automatically resolves node overlaps, expands compressed vertical stacks for arrow visibility, frames stage_box containers, fixes borderless math labels, and applies semantic theme colors.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "themeId": { "type": "string" }
                }
            }),
        },
        McpToolSpec {
            name: "propose_tikz_patch".into(),
            description: "Proposes a clean, surgical TikZ code patch or full figure with semantic diff preview and layout verification.".into(),
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
