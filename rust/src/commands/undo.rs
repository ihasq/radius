/// undo command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_undo(_args: &Value) -> IpcResponse {
    IpcResponse::error("undo: history tracking not implemented in Rust version".to_string())
}
