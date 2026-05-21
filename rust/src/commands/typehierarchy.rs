/// typehierarchy command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_typehierarchy(_args: &Value) -> IpcResponse {
    IpcResponse::error("typehierarchy: not implemented in Rust version".to_string())
}
