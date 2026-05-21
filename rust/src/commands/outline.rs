/// outline command (stub - needs tree-sitter)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_outline(_args: &Value) -> IpcResponse {
    IpcResponse::error("outline: tree-sitter parsing not implemented in Rust version".to_string())
}
