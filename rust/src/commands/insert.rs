/// insert command
use crate::ipc::IpcResponse;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

pub async fn handle_insert(args: &Value) -> IpcResponse {
    let file = match args.get("file").or_else(|| args.get("_").and_then(|v| v.get(0))) {
        Some(Value::String(s)) => s,
        _ => return IpcResponse::error("Missing required arg: file".to_string()),
    };
    
    let line = match args.get("line").and_then(|v| v.as_u64()) {
        Some(n) => n as usize,
        _ => return IpcResponse::error("Missing required arg: --line".to_string()),
    };
    
    let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
    let stdin = args.get("stdin").and_then(|v| v.as_str());
    
    let abs_path = PathBuf::from(file);
    let abs_path = if abs_path.is_absolute() { abs_path } else { std::env::current_dir().unwrap_or_default().join(file) };
    
    let mut file_content = match fs::read_to_string(&abs_path) {
        Ok(c) => c,
        Err(e) => return IpcResponse::error(format!("Failed to read file: {}", e)),
    };
    
    let insert_text = if !content.is_empty() { content } else { stdin.unwrap_or("") };
    
    let lines: Vec<&str> = file_content.lines().collect();
    if line > lines.len() {
        return IpcResponse::error(format!("Line {} out of range (file has {} lines)", line, lines.len()));
    }
    
    let mut new_lines = Vec::new();
    for (i, l) in lines.iter().enumerate() {
        if i + 1 == line {
            new_lines.push(insert_text.to_string());
        }
        new_lines.push(l.to_string());
    }
    
    let new_content = new_lines.join("\n") + "\n";
    match fs::write(&abs_path, &new_content) {
        Ok(_) => IpcResponse::success(format!("Inserted at line {} in {}", line, abs_path.display())),
        Err(e) => IpcResponse::error(format!("Failed to write file: {}", e)),
    }
}
