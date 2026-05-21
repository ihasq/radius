/// graph command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_graph(_args: &Value) -> IpcResponse {
    IpcResponse::error("graph: not implemented in Rust version".to_string())
}
