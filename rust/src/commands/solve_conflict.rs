/// solve_conflict command (stub)
use crate::ipc::IpcResponse;
use serde_json::Value;

pub async fn handle_solve_conflict(_args: &Value) -> IpcResponse {
    IpcResponse::error("solve_conflict: not implemented in Rust version".to_string())
}
