pub mod bridge;
mod config;

pub use agentikz_mcp::manifest::{builtin_tools, ToolSpec};
pub use config::*;

#[tauri::command]
pub fn mcp_get_manifest() -> Vec<ToolSpec> {
    builtin_tools()
}
