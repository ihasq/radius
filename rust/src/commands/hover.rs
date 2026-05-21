/// hover command (stub - needs radls)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_hover(_args: &Value) -> IpcResponse {
    IpcResponse::error("hover: radls integration not implemented in Rust version".to_string())
}
