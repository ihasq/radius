/// format command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_format(_args: &Value) -> IpcResponse {
    IpcResponse::error("format: formatter not implemented in Rust version".to_string())
}
