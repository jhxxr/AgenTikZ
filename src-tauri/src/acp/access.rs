use super::protocol_workspace_path;
use agent_client_protocol::v1::schema::{
    ClientCapabilities, FileSystemCapabilities, PermissionOptionKind, ReadTextFileRequest,
    RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
    SelectedPermissionOutcome, SessionModeId, SessionModeState,
};
use std::path::{Path, PathBuf};

const MAX_TEXT_FILE_BYTES: u64 = 8 * 1024 * 1024;

pub(super) fn client_capabilities(full_access: bool) -> ClientCapabilities {
    // CLI agents retain their native command tools; no client terminal is advertised.
    ClientCapabilities::new().fs(FileSystemCapabilities::new()
        .read_text_file(full_access)
        .write_text_file(full_access))
}

pub(super) fn permission_response(
    request: &RequestPermissionRequest,
    full_access: bool,
) -> RequestPermissionResponse {
    let option = full_access
        .then(|| {
            request
                .options
                .iter()
                .find(|option| option.kind == PermissionOptionKind::AllowOnce)
        })
        .flatten();
    RequestPermissionResponse::new(match option {
        Some(option) => RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
            option.option_id.clone(),
        )),
        None => RequestPermissionOutcome::Cancelled,
    })
}

pub(super) fn full_access_mode(modes: Option<&SessionModeState>) -> Option<SessionModeId> {
    // Only select a full-access mode that the agent explicitly offers.
    let modes = modes?;
    modes
        .available_modes
        .iter()
        .find(|mode| {
            matches!(
                mode.id.to_string().as_str(),
                "agent-full-access" | "full-access" | "bypassPermissions" | "yolo"
            ) || mode
                .meta
                .as_ref()
                .and_then(|meta| meta.get("kind"))
                .and_then(serde_json::Value::as_str)
                == Some("full_access")
        })
        .map(|mode| mode.id.clone())
}

pub(super) fn resolve_working_directory(
    default_dir: &Path,
    full_access: bool,
    working_directory: Option<&str>,
) -> Result<PathBuf, String> {
    let requested = working_directory
        .map(str::trim)
        .filter(|path| !path.is_empty());
    let dir = if full_access {
        requested
            .map(PathBuf::from)
            .unwrap_or_else(|| default_dir.to_path_buf())
    } else {
        default_dir.to_path_buf()
    };
    if !dir.is_absolute() {
        return Err("Agent 工作目录必须是文件夹的绝对路径。请在设置 → Agent 中修改。".into());
    }
    if (!full_access || requested.is_none()) && dir == default_dir {
        std::fs::create_dir_all(&dir)
            .map_err(|error| format!("Cannot create ACP workspace: {error}"))?;
    }
    if !dir.is_dir() {
        return Err(format!(
            "Agent 工作目录不存在或不是文件夹：{}",
            dir.display()
        ));
    }
    dir.canonicalize()
        .map(protocol_workspace_path)
        .map_err(|error| format!("Cannot resolve ACP workspace: {error}"))
}

fn check_file_access(full_access: bool, path: &Path) -> Result<(), String> {
    if !full_access {
        return Err("本机文件访问未开启。请在设置 → Agent 中开启「完整本机访问」。".into());
    }
    if !path.is_absolute() {
        return Err("ACP file tools require an absolute path.".into());
    }
    Ok(())
}

pub(super) fn read_text_file(
    full_access: bool,
    request: &ReadTextFileRequest,
) -> Result<String, String> {
    check_file_access(full_access, &request.path)?;
    if request.line == Some(0) {
        return Err("ACP file line numbers start at 1.".into());
    }
    // Bound the read itself as well as checking metadata, including for files that grow.
    use std::io::Read;
    let file = std::fs::File::open(&request.path).map_err(|error| error.to_string())?;
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_TEXT_FILE_BYTES {
        return Err("ACP text tools support regular UTF-8 files up to 8 MiB.".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_TEXT_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err("ACP text file exceeds 8 MiB.".into());
    }
    let content = String::from_utf8(bytes).map_err(|error| error.to_string())?;
    if request.line.is_none() && request.limit.is_none() {
        return Ok(content);
    }
    Ok(content
        .split_inclusive('\n')
        .skip(request.line.unwrap_or(1).saturating_sub(1) as usize)
        .take(
            request
                .limit
                .map(|limit| limit as usize)
                .unwrap_or(usize::MAX),
        )
        .collect())
}

pub(super) fn write_text_file(full_access: bool, path: &Path, content: &str) -> Result<(), String> {
    check_file_access(full_access, path)?;
    if content.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err("ACP text file exceeds 8 MiB.".into());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::write(path, content).map_err(|error| error.to_string())
}

pub(super) fn prompt_instructions(full_access: bool) -> &'static str {
    if full_access {
        "You are assisting in AgenTikZ, a TikZ & PGFPlots editor. The user enabled full local access in settings. You may read and modify local files, including files outside the working directory, and use the agent's native command tools as needed for the user's task. Use absolute paths for files outside the working directory. Tool permission requests are approved for this run. Inspect relevant local sources when the user supplies a file or folder path; report actual tool errors accurately. For canvas changes, return proposed TikZ for review."
    } else {
        "You are assisting in AgenTikZ, a TikZ & PGFPlots editor. Native filesystem and command permission requests are denied in restricted mode; do not use native file or command tools. Independently enabled MCP tools are authorized and may be used for the user's task. Return canvas changes as proposals for review. If the required local access is unavailable through enabled tools, tell the user to enable Full local access in Settings > Agent."
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol::v1::schema::{
        PermissionOption, SessionMode, ToolCallUpdate, ToolCallUpdateFields,
    };

    fn permission_request(options: Vec<PermissionOption>) -> RequestPermissionRequest {
        RequestPermissionRequest::new(
            "session",
            ToolCallUpdate::new("tool", ToolCallUpdateFields::new()),
            options,
        )
    }

    #[test]
    fn permissions_require_opt_in_and_prefer_one_time_consent() {
        let request = permission_request(vec![
            PermissionOption::new("reject", "Reject", PermissionOptionKind::RejectOnce),
            PermissionOption::new("always", "Always", PermissionOptionKind::AllowAlways),
            PermissionOption::new("once", "Once", PermissionOptionKind::AllowOnce),
        ]);
        assert_eq!(
            permission_response(&request, false).outcome,
            RequestPermissionOutcome::Cancelled
        );
        assert_eq!(
            permission_response(&request, true).outcome,
            RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new("once"))
        );
        let always_only = permission_request(vec![PermissionOption::new(
            "always",
            "Always",
            PermissionOptionKind::AllowAlways,
        )]);
        assert_eq!(
            permission_response(&always_only, true).outcome,
            RequestPermissionOutcome::Cancelled
        );
    }

    #[test]
    fn selects_only_advertised_full_access_modes() {
        let modes = SessionModeState::new(
            "agent",
            vec![
                SessionMode::new("agent", "Agent"),
                SessionMode::new("agent-full-access", "Full access"),
            ],
        );
        assert_eq!(
            full_access_mode(Some(&modes)),
            Some(SessionModeId::new("agent-full-access"))
        );
        assert_eq!(full_access_mode(None), None);
        assert_eq!(
            full_access_mode(Some(&SessionModeState::new(
                "plan",
                vec![SessionMode::new("plan", "Plan"),]
            ))),
            None
        );
    }

    #[test]
    fn full_access_reads_and_writes_outside_working_directory() {
        let root = std::env::temp_dir().join(format!(
            "agentikz-access-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let workspace = root.join("workspace");
        let external = root.join("external/research notes.txt");
        let cwd = resolve_working_directory(&workspace, false, Some("ignored")).unwrap();
        assert!(cwd.is_dir());
        assert!(!external.starts_with(&workspace));
        assert!(write_text_file(false, &external, "denied").is_err());
        assert!(!external.exists());
        write_text_file(true, &external, "第一行\r\nsecond\r\nlast").unwrap();
        let read = ReadTextFileRequest::new("session", &external);
        assert!(read_text_file(false, &read).is_err());
        assert_eq!(
            read_text_file(true, &read).unwrap(),
            "第一行\r\nsecond\r\nlast"
        );
        assert_eq!(
            read_text_file(true, &read.clone().line(2).limit(1)).unwrap(),
            "second\r\n"
        );
        assert_eq!(read_text_file(true, &read.clone().line(20)).unwrap(), "");
        assert!(read_text_file(true, &read.clone().line(0)).is_err());
        assert!(
            read_text_file(true, &ReadTextFileRequest::new("session", "relative.txt")).is_err()
        );
        assert_eq!(
            resolve_working_directory(&workspace, true, external.parent().unwrap().to_str())
                .unwrap(),
            protocol_workspace_path(external.parent().unwrap().canonicalize().unwrap())
        );
        assert!(resolve_working_directory(&workspace, true, Some("relative")).is_err());
        assert!(
            resolve_working_directory(&workspace, true, root.join("missing").to_str()).is_err()
        );
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn capabilities_and_prompt_follow_access_setting() {
        for full_access in [false, true] {
            let capabilities = client_capabilities(full_access);
            assert_eq!(capabilities.fs.read_text_file, full_access);
            assert_eq!(capabilities.fs.write_text_file, full_access);
            assert!(!capabilities.terminal);
        }
        assert!(prompt_instructions(true).contains("outside the working directory"));
        assert!(!prompt_instructions(true).contains("do not execute"));
        assert!(prompt_instructions(false).contains("denied"));
    }
}
