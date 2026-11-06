pub mod acp;
pub mod mcp;
pub mod tex {
    pub mod compiler;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            acp::init_bundled_adapters(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            acp::acp_probe_agents,
            acp::acp_test_agent,
            acp::acp_send_prompt,
            acp::sys_probe_environment,
            mcp::mcp_get_manifest,
            tex::compiler::tex_compile_preview,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgenTikZ tauri application");
}
