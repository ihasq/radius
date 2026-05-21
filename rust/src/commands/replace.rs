/// replace command
use crate::ipc::IpcResponse;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use regex::Regex;

pub async fn handle_replace(args: &Value) -> IpcResponse {
    let file = match args.get("file").or_else(|| args.get("_").and_then(|v| v.get(0))) {
        Some(Value::String(s)) => s,
        _ => return IpcResponse::error("Missing required arg: file".to_string()),
    };
    
    let pattern = match args.get("pattern") {
        Some(Value::String(s)) => s,
        _ => return IpcResponse::error("Missing required arg: --pattern".to_string()),
    };
    
    let replacement = match args.get("replacement") {
        Some(Value::String(s)) => s,
        _ => return IpcResponse::error("Missing required arg: --replacement".to_string()),
    };
    
    let abs_path = PathBuf::from(file);
    let abs_path = if abs_path.is_absolute() { abs_path } else { std::env::current_dir().unwrap_or_default().join(file) };
    
    let content = match fs::read_to_string(&abs_path) {
        Ok(c) => c,
        Err(e) => return IpcResponse::error(format!("Failed to read file: {}", e)),
    };
    
    let re = match Regex::new(pattern) {
        Ok(r) => r,
        Err(e) => return IpcResponse::error(format!("Invalid regex: {}", e)),
    };
    
    let new_content = re.replace_all(&content, replacement.as_str()).to_string();
    
    match fs::write(&abs_path, &new_content) {
        Ok(_) => IpcResponse::success(format!("Replaced in {}", abs_path.display())),
        Err(e) => IpcResponse::error(format!("Failed to write file: {}", e)),
    }
}
