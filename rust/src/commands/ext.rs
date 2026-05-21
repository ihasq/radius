/// ext command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_ext(_args: &Value) -> IpcResponse {
    IpcResponse::error("ext: not implemented in Rust version".to_string())
}
