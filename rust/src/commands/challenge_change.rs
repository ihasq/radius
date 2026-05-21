/// challenge_change command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_challenge_change(_args: &Value) -> IpcResponse {
    IpcResponse::error("challenge_change: not implemented in Rust version".to_string())
}
