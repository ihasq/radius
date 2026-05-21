/// problems command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_problems(_args: &Value) -> IpcResponse {
    IpcResponse::error("problems: not implemented in Rust version".to_string())
}
