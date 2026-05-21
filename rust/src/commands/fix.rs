/// fix command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_fix(_args: &Value) -> IpcResponse {
    IpcResponse::error("fix: not implemented in Rust version".to_string())
}
