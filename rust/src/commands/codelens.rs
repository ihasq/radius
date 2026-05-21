/// codelens command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_codelens(_args: &Value) -> IpcResponse {
    IpcResponse::error("codelens: not implemented in Rust version".to_string())
}
