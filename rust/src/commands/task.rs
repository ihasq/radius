/// task command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_task(_args: &Value) -> IpcResponse {
    IpcResponse::error("task: not implemented in Rust version".to_string())
}
