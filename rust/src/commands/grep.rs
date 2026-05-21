/// grep command

use crate::ipc::IpcResponse;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub async fn handle_grep(args: &Value) -> IpcResponse {
    let pattern = match args.get("pattern").or_else(|| args.get("_").and_then(|v| v.get(0))) {
        Some(Value::String(s)) => s,
        _ => return IpcResponse::error("Missing required arg: pattern".to_string()),
    };

    let path = args
        .get("path")
        .or_else(|| args.get("_").and_then(|v| v.get(1)))
        .and_then(|v| v.as_str())
        .unwrap_or(".");

    let search_path = PathBuf::from(path);

    let mut results = Vec::new();

    for entry in WalkDir::new(&search_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let file_path = entry.path();
        if let Ok(content) = fs::read_to_string(file_path) {
            for (line_num, line) in content.lines().enumerate() {
                if line.contains(pattern) {
                    results.push(format!(
                        "{}:{}:{}",
                        file_path.display(),
                        line_num + 1,
                        line
                    ));
                }
            }
        }
    }

    if results.is_empty() {
        IpcResponse::success("No matches found".to_string())
    } else {
        IpcResponse::success(results.join("\n"))
    }
}
