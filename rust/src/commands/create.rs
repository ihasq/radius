/// create command handler
///
/// Create new file

use crate::ipc::IpcResponse;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

pub async fn handle_create(args: &Value) -> IpcResponse {
    let file = match args.get("file").or_else(|| args.get("_").and_then(|v| v.get(0))) {
        Some(Value::String(s)) => s,
        Some(Value::Array(arr)) if !arr.is_empty() => {
            match &arr[0] {
                Value::String(s) => s,
                _ => return IpcResponse::error("Missing required arg: file".to_string()),
            }
        }
        _ => return IpcResponse::error("Missing required arg: file".to_string()),
    };

    let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
    let stdin = args.get("stdin").and_then(|v| v.as_str());
    let force = args.get("force").and_then(|v| v.as_bool()).unwrap_or(false);

    let abs_path = PathBuf::from(file);
    let abs_path = if abs_path.is_absolute() {
        abs_path
    } else {
        std::env::current_dir().unwrap_or_default().join(file)
    };

    // Check if file exists
    let file_exists = abs_path.exists();
    if file_exists && !force {
        return IpcResponse::error("file already exists. Use --force to overwrite.".to_string());
    }

    // Create parent directory
    if let Some(parent) = abs_path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            return IpcResponse::error(format!("Failed to create directory: {}", e));
        }
    }

    // Content priority: content > stdin > empty
    let file_content = if !content.is_empty() {
        content
    } else if let Some(s) = stdin {
        s
    } else {
        ""
    };

    // Write file
    match fs::write(&abs_path, file_content) {
        Ok(_) => {
            let msg = if file_exists {
                format!("File overwritten: {}", abs_path.display())
            } else {
                format!("File created: {}", abs_path.display())
            };
            IpcResponse::success(msg)
        }
        Err(e) => IpcResponse::error(format!("Failed to create file: {}", e)),
    }
}
