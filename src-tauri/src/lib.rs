pub mod acp;
pub mod image_gen;
pub mod mcp;
pub mod pi;
pub mod project;
pub mod tex {
    pub mod compiler;
    pub mod synctex;
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
            acp::acp_cancel_prompt,
            acp::sys_probe_environment,
            pi::pi_probe,
            pi::pi_send_prompt,
            pi::pi_cancel_prompt,
            pi::pi_reset_runtime,
            pi::pi_save_api_key,
            pi::pi_delete_api_key,
            pi::pi_has_api_key,
            mcp::mcp_get_manifest,
            mcp::mcp_get_config,
            mcp::mcp_save_config,
            mcp::mcp_test_server,
            mcp::bridge::mcp_tool_result,
            mcp::bridge::mcp_test_builtin,
            image_gen::img_generate_illustration,
            image_gen::img_save_processed_asset,
            tex::compiler::tex_compile_preview,
            tex::compiler::tex_scan_installations,
            tex::compiler::tex_compile_paper,
            tex::synctex::tex_read_paper_pdf,
            tex::synctex::tex_synctex_forward,
            tex::synctex::tex_synctex_backward,
            project::project_pick_directory,
            project::project_open_workspace,
            project::project_load_canvas,
            project::project_save_canvas,
            project::project_rename_canvas,
            project::project_delete_canvas,
            project::project_scan_assets,
            project::project_check_figure_asset,
            project::project_read_asset_data_url,
            project::project_import_asset,
            project::project_export_file,
            project::project_reveal_in_explorer,
            project::project_init_paper_workspace,
            project::project_list_paper_files,
            project::project_read_text_file,
            project::project_write_text_file,
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                mcp::bridge::revoke_window(window.label());
                acp::cancel_window(window.label());
                pi::close_window(window.label());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running AgenTikZ tauri application");
}
