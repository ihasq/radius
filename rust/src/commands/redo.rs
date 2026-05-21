/// redo command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_redo(_args: &Value) -> IpcResponse {
    IpcResponse::error("redo: history tracking not implemented in Rust version".to_string())
}
