/// diff command
use crate::ipc::IpcResponse;
use serde_json::Value;
use std::process::Command;

pub async fn handle_diff(args: &Value) -> IpcResponse {
    let reference = args.get("ref").and_then(|v| v.as_str()).unwrap_or("HEAD");
    
    let output = match Command::new("git").args(&["diff", reference]).output() {
        Ok(o) => o,
        Err(e) => return IpcResponse::error(format!("Failed to run git diff: {}", e)),
    };
    
    if !output.status.success() {
        return IpcResponse::error(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    IpcResponse::success(String::from_utf8_lossy(&output.stdout).to_string())
}
