/// str-replace command

use crate::ipc::IpcResponse;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

pub async fn handle_str_replace(args: &Value) -> IpcResponse {
    let file = match args.get("file").or_else(|| args.get("_").and_then(|v| v.get(0))) {
        Some(Value::String(s)) => s,
        _ => return IpcResponse::error("Missing required arg: file".to_string()),
    };

    let old = match args.get("old") {
        Some(Value::String(s)) => s,
        _ => return IpcResponse::error("Missing required arg: --old".to_string()),
    };

    let new = match args.get("new") {
        Some(Value::String(s)) => s,
        _ => return IpcResponse::error("Missing required arg: --new".to_string()),
    };

    let abs_path = PathBuf::from(file);
    let abs_path = if abs_path.is_absolute() {
        abs_path
    } else {
        std::env::current_dir().unwrap_or_default().join(file)
    };

    let content = match fs::read_to_string(&abs_path) {
        Ok(c) => c,
        Err(e) => return IpcResponse::error(format!("Failed to read file: {}", e)),
    };

    // Check uniqueness
    let matches: Vec<_> = content.match_indices(old).collect();
    if matches.is_empty() {
        return IpcResponse::error(format!("Pattern not found: {}", old));
    }
    if matches.len() > 1 {
        return IpcResponse::error(format!(
            "Pattern found {} times (must be unique)",
            matches.len()
        ));
    }

    // Replace
    let new_content = content.replacen(old, new, 1);

    match fs::write(&abs_path, &new_content) {
        Ok(_) => IpcResponse::success(format!("Replaced in {}", abs_path.display())),
        Err(e) => IpcResponse::error(format!("Failed to write file: {}", e)),
    }
}
