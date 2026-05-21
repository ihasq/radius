/// modify_var command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_modify_var(_args: &Value) -> IpcResponse {
    IpcResponse::error("modify_var: not implemented in Rust version".to_string())
}
