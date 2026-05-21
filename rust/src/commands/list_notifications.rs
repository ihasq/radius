/// list_notifications command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_list_notifications(_args: &Value) -> IpcResponse {
    IpcResponse::error("list_notifications: not implemented in Rust version".to_string())
}
