/// view command handler
///
/// View file contents or list directory

use crate::buffer::BufferManager;
use crate::ipc::IpcResponse;
use crate::shared::{analyzeFileContext, formatContextSection};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

pub async fn handle_view(
    args: &Value,
    buffer_manager: &mut BufferManager,
) -> IpcResponse {
    let path = match args.get("path").or_else(|| args.get("_").and_then(|v| v.get(0))) {
        Some(Value::String(s)) => s,
        Some(Value::Array(arr)) if !arr.is_empty() => {
            match &arr[0] {
                Value::String(s) => s,
                _ => return IpcResponse::error("Missing required arg: path".to_string()),
            }
        }
        _ => return IpcResponse::error("Missing required arg: path".to_string()),
    };

    let range = args.get("range").and_then(|v| v.as_str());

    let abs_path = PathBuf::from(path);
    let abs_path = if abs_path.is_absolute() {
        abs_path
    } else {
        std::env::current_dir().unwrap_or_default().join(path)
    };

    if !abs_path.exists() {
        return IpcResponse::error(format!("Path not found: {}", abs_path.display()));
    }

    // Directory case
    if abs_path.is_dir() {
        match fs::read_dir(&abs_path) {
            Ok(entries) => {
                let mut names: Vec<String> = entries
                    .filter_map(|e| e.ok())
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .collect();
                names.sort();
                IpcResponse::success(names.join("\n"))
            }
            Err(e) => IpcResponse::error(format!("Failed to read directory: {}", e)),
        }
    } else {
        // File case
        match handle_view_file(&abs_path, range, buffer_manager, path) {
            Ok(data) => IpcResponse::success(data),
            Err(e) => IpcResponse::error(format!("Failed to read file: {}", e)),
        }
    }
}

fn handle_view_file(
    abs_path: &PathBuf,
    range: Option<&str>,
    buffer_manager: &mut BufferManager,
    display_path: &str,
) -> anyhow::Result<String> {
    let line_count = buffer_manager.get_line_count(abs_path)?;
    let content = buffer_manager.get_content(abs_path)?;

    // Analyze context
    let ctx = analyzeFileContext(abs_path.as_path(), &content);
    let export_count = ctx.as_ref().map(|c| c.exports.len()).unwrap_or(0);
    let import_count = ctx.as_ref().map(|c| c.imports.len()).unwrap_or(0);

    let mut start_line = 1;
    let mut end_line = line_count;

    // Parse range
    if let Some(range_str) = range {
        let parts: Vec<&str> = range_str.split(':').collect();
        if parts.len() != 2 {
            return Err(anyhow::anyhow!("Invalid range format. Use: <start>:<end>"));
        }
        start_line = parts[0].parse()?;
        end_line = parts[1].parse()?;

        if start_line < 1 || end_line > line_count || start_line > end_line {
            return Err(anyhow::anyhow!(
                "Invalid range: {}:{} (file has {} lines)",
                start_line,
                end_line,
                line_count
            ));
        }
    }

    let max_lines = 200;
    let head_lines = 100;
    let tail_lines = 20;

    let mut output = Vec::new();

    // Large file with no range: head + tail format
    if range.is_none() && (end_line - start_line + 1) > max_lines {
        // Header
        let mut stats = vec![format!("{} lines", line_count)];
        if export_count > 0 {
            stats.push(format!(
                "{} export{}",
                export_count,
                if export_count > 1 { "s" } else { "" }
            ));
        }
        if import_count > 0 {
            stats.push(format!(
                "{} import{}",
                import_count,
                if import_count > 1 { "s" } else { "" }
            ));
        }
        output.push(format!("view: {} ({})", display_path, stats.join(", ")));
        output.push(String::new());

        // First 100 lines
        for i in 1..=head_lines {
            let line_num = format!("{:>5}", i);
            let content = buffer_manager.get_line_content(abs_path, i)?;
            output.push(format!("{}: {}", line_num, content));
        }

        // Omitted message
        let omitted = line_count - head_lines - tail_lines;
        output.push(String::new());
        output.push(format!("... ({} lines omitted) ...", omitted));
        output.push(String::new());

        // Last 20 lines
        for i in (line_count - tail_lines + 1)..=line_count {
            let line_num = format!("{:>5}", i);
            let content = buffer_manager.get_line_content(abs_path, i)?;
            output.push(format!("{}: {}", line_num, content));
        }

        // Context section
        let context_section = ctx.as_ref().map(formatContextSection).unwrap_or_default();
        return Ok(output.join("\n") + &context_section);
    }

    // Normal output (<=200 lines or with range)
    if range.is_none() {
        // Header (only if no range)
        let mut stats = vec![format!("{} lines", line_count)];
        if export_count > 0 {
            stats.push(format!(
                "{} export{}",
                export_count,
                if export_count > 1 { "s" } else { "" }
            ));
        }
        if import_count > 0 {
            stats.push(format!(
                "{} import{}",
                import_count,
                if import_count > 1 { "s" } else { "" }
            ));
        }
        output.push(format!("view: {} ({})", display_path, stats.join(", ")));
        output.push(String::new());
    }

    for i in start_line..=end_line {
        let line_num = format!("{:>5}", i);
        let content = buffer_manager.get_line_content(abs_path, i)?;
        output.push(format!("{}: {}", line_num, content));
    }

    // Context section (skip if range specified)
    let context_section = if range.is_none() {
        ctx.as_ref().map(formatContextSection).unwrap_or_default()
    } else {
        String::new()
    };

    Ok(output.join("\n") + &context_section)
}
