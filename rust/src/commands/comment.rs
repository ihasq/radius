/// comment command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_comment(_args: &Value) -> IpcResponse {
    IpcResponse::error("comment: not implemented in Rust version".to_string())
}
