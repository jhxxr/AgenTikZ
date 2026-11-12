//! User-authorized, long-lived drawing connections for independent MCP clients.
//! Unlike ACP leases these are owned by the window, not an in-app chat turn.
use super::bridge::{self, BridgeLease, CanvasTarget};
use serde_json::Value;
use std::{collections::HashMap, sync::Mutex};
use tauri::{AppHandle, Manager, WebviewWindow};

#[derive(Default)]
pub struct ExternalConnections(Mutex<HashMap<String, ExternalConnection>>);

struct ExternalConnection {
    request_id: String,
    lease: Option<BridgeLease>,
}

impl ExternalConnections {
    fn reserve(&self, label: &str, request_id: &str) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| "外部 MCP 连接状态不可用。")?
            .insert(
                label.into(),
                ExternalConnection {
                    request_id: request_id.into(),
                    lease: None,
                },
            );
        Ok(())
    }

    fn stop(&self, label: &str, request_id: &str) -> Result<(), String> {
        let mut connections = self.0.lock().map_err(|_| "外部 MCP 连接状态不可用。")?;
        // This also cancels a reserved start before its listener is ready.
        if connections
            .get(label)
            .is_some_and(|connection| connection.request_id == request_id)
        {
            connections.remove(label);
        }
        Ok(())
    }
}

pub fn stop_window(app: &AppHandle, label: &str) {
    let state = app.state::<ExternalConnections>();
    if let Ok(mut connections) = state.0.lock() {
        connections.remove(label);
    };
}

pub fn stop_all(app: &AppHandle) {
    let state = app.state::<ExternalConnections>();
    if let Ok(mut connections) = state.0.lock() {
        connections.clear();
    };
}

#[tauri::command]
pub async fn mcp_start_external(
    app: AppHandle,
    window: WebviewWindow,
    request_id: String,
    target: CanvasTarget,
) -> Result<Value, String> {
    if !super::read_config(&app)?.builtin_enabled {
        return Err("请先启用 AgenTikZ MCP 工具。".into());
    }
    let command = bridge::sidecar_path(&app)?;
    let state = app.state::<ExternalConnections>();
    state.reserve(window.label(), &request_id)?;
    let result = bridge::start_external_for_window(
        app.clone(),
        window.label().into(),
        request_id.clone(),
        target,
    )
    .await;
    // Do not retain or export credentials to disk. Replacing a lease revokes it.
    let mut connections = state.0.lock().map_err(|_| "外部 MCP 连接状态不可用。")?;
    if !connections
        .get(window.label())
        .is_some_and(|connection| connection.request_id == request_id)
    {
        return Err("外部 MCP 连接已取消或被新连接替换。".into());
    }
    // Disabling tools while the listener was starting must not leave a live lease.
    let result = result.and_then(|lease| {
        if !super::read_config(&app)?.builtin_enabled {
            return Err("AgenTikZ MCP 工具已关闭。".into());
        }
        Ok(lease)
    });
    match result {
        Ok(lease) => {
            let config = lease.external_client_config(&command);
            connections.get_mut(window.label()).unwrap().lease = Some(lease);
            Ok(config)
        }
        Err(error) => {
            connections.remove(window.label());
            Err(error)
        }
    }
}

#[tauri::command]
pub fn mcp_stop_external(
    app: AppHandle,
    window: WebviewWindow,
    request_id: String,
) -> Result<(), String> {
    app.state::<ExternalConnections>()
        .stop(window.label(), &request_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancels_pending_starts_and_does_not_stop_replacement_or_other_windows() {
        let state = ExternalConnections::default();
        state.reserve("main", "old").unwrap();
        state.reserve("other", "another").unwrap();
        state.stop("main", "old").unwrap();
        assert!(!state.0.lock().unwrap().contains_key("main"));
        state.reserve("main", "new").unwrap();
        state.stop("main", "old").unwrap();
        let connections = state.0.lock().unwrap();
        assert_eq!(connections["main"].request_id, "new");
        assert_eq!(connections["other"].request_id, "another");
    }
}
