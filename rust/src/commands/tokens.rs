/// tokens command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_tokens(_args: &Value) -> IpcResponse {
    IpcResponse::error("tokens: not implemented in Rust version".to_string())
}
