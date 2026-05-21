/// read_var command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_read_var(_args: &Value) -> IpcResponse {
    IpcResponse::error("read_var: not implemented in Rust version".to_string())
}
