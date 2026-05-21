/// Buffer Manager using ropey
///
/// Manages file buffers and line operations

use ropey::Rope;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

pub struct BufferManager {
    buffers: HashMap<PathBuf, Rope>,
}

impl BufferManager {
    pub fn new() -> Self {
        Self {
            buffers: HashMap::new(),
        }
    }

    /// Ensure buffer is loaded
    fn ensure_loaded(&mut self, path: &PathBuf) -> anyhow::Result<()> {
        if !self.buffers.contains_key(path) {
            let content = fs::read_to_string(path)?;
            let rope = Rope::from_str(&content);
            self.buffers.insert(path.clone(), rope);
        }
        Ok(())
    }

    /// Get line count
    pub fn get_line_count(&mut self, path: &PathBuf) -> anyhow::Result<usize> {
        self.ensure_loaded(path)?;
        let rope = self.buffers.get(path).unwrap();
        Ok(rope.len_lines())
    }

    /// Get line content (1-indexed)
    pub fn get_line_content(&mut self, path: &PathBuf, line: usize) -> anyhow::Result<String> {
        self.ensure_loaded(path)?;
        let rope = self.buffers.get(path).unwrap();

        if line < 1 || line > rope.len_lines() {
            return Ok(String::new());
        }

        let line_idx = line - 1;
        let line_start = rope.line_to_char(line_idx);
        let line_end = if line_idx + 1 < rope.len_lines() {
            rope.line_to_char(line_idx + 1)
        } else {
            rope.len_chars()
        };

        let mut content = rope.slice(line_start..line_end).to_string();
        // Remove trailing newline
        if content.ends_with('\n') {
            content.pop();
        }
        if content.ends_with('\r') {
            content.pop();
        }

        Ok(content)
    }

    /// Get entire file content
    pub fn get_content(&mut self, path: &PathBuf) -> anyhow::Result<String> {
        self.ensure_loaded(path)?;
        let rope = self.buffers.get(path).unwrap();
        Ok(rope.to_string())
    }
}
