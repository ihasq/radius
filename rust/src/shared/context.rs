/// File context analysis
///
/// Analyzes imports, exports, and generates context sections

use std::path::Path;

#[derive(Debug)]
pub struct FileContext {
    pub imports: Vec<String>,
    pub exports: Vec<String>,
}

/// Analyze file context (stub implementation)
pub fn analyzeFileContext(_path: &Path, content: &str) -> Option<FileContext> {
    // Simple regex-based analysis for now
    let imports: Vec<String> = content
        .lines()
        .filter(|line| line.trim_start().starts_with("import "))
        .map(|s| s.to_string())
        .collect();

    let exports: Vec<String> = content
        .lines()
        .filter(|line| line.trim_start().starts_with("export "))
        .map(|s| s.to_string())
        .collect();

    Some(FileContext { imports, exports })
}

/// Format context section
pub fn formatContextSection(ctx: &FileContext) -> String {
    let mut output = String::new();

    if !ctx.exports.is_empty() || !ctx.imports.is_empty() {
        output.push_str("\n\n## context\n\n");

        if !ctx.exports.is_empty() {
            output.push_str("Exports:\n");
            for exp in &ctx.exports {
                output.push_str(&format!("  {}\n", exp));
            }
        }

        if !ctx.imports.is_empty() {
            if !ctx.exports.is_empty() {
                output.push('\n');
            }
            output.push_str("Imports:\n");
            for imp in &ctx.imports {
                output.push_str(&format!("  {}\n", imp));
            }
        }
    }

    output
}