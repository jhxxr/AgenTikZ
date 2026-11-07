pub mod acp;
pub mod mcp;
pub mod project;
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
            project::project_pick_directory,
            project::project_open_workspace,
            project::project_load_canvas,
            project::project_save_canvas,
            project::project_rename_canvas,
            project::project_delete_canvas,
            project::project_scan_assets,
            project::project_read_asset_data_url,
            project::project_import_asset,
            project::project_export_file,
            project::project_reveal_in_explorer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgenTikZ tauri application");
}
