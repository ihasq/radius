/// snippet command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_snippet(_args: &Value) -> IpcResponse {
    IpcResponse::error("snippet: not implemented in Rust version".to_string())
}
