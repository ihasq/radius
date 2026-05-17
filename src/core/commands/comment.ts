/**
 * Phase 19: comment コマンドハンドラ。
 *
 * 行またはブロックのコメントをトグルする。
 */

import { existsSync } from "node:fs";
import { resolve, relative, extname } from "node:path";
import { findProjectRoot } from "../../shared/project";
import type { IpcResponse } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import type { HistoryTracker } from "../history/tracker";
import type { BufferManager } from "../buffer/manager";
import type { Changeset } from "../history/types";

/** 言語ごとのコメント構文。 */
interface CommentSyntax {
  line?: string;
  blockStart?: string;
  blockEnd?: string;
}

const COMMENT_SYNTAX: Record<string, CommentSyntax> = {
  typescript: { line: "//", blockStart: "/*", blockEnd: "*/" },
  javascript: { line: "//", blockStart: "/*", blockEnd: "*/" },
  ts: { line: "//", blockStart: "/*", blockEnd: "*/" },
  tsx: { line: "//", blockStart: "/*", blockEnd: "*/" },
  js: { line: "//", blockStart: "/*", blockEnd: "*/" },
  jsx: { line: "//", blockStart: "/*", blockEnd: "*/" },
  css: { blockStart: "/*", blockEnd: "*/" },
  html: { blockStart: "<!--", blockEnd: "-->" },
  xml: { blockStart: "<!--", blockEnd: "-->" },
  json: { line: "//", blockStart: "/*", blockEnd: "*/" },
  python: { line: "#" },
  py: { line: "#" },
  ruby: { line: "#" },
  rb: { line: "#" },
  shell: { line: "#" },
  sh: { line: "#" },
  bash: { line: "#" },
  yaml: { line: "#" },
  yml: { line: "#" },
  rust: { line: "//", blockStart: "/*", blockEnd: "*/" },
  rs: { line: "//", blockStart: "/*", blockEnd: "*/" },
  go: { line: "//", blockStart: "/*", blockEnd: "*/" },
  java: { line: "//", blockStart: "/*", blockEnd: "*/" },
  c: { line: "//", blockStart: "/*", blockEnd: "*/" },
  cpp: { line: "//", blockStart: "/*", blockEnd: "*/" },
  csharp: { line: "//", blockStart: "/*", blockEnd: "*/" },
  cs: { line: "//", blockStart: "/*", blockEnd: "*/" },
};

/**
 * comment コマンドハンドラ。
 */
export async function handleComment(
  args: Record<string, unknown>,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
  bufferManager: BufferManager
): Promise<IpcResponse> {
  const file = args.file as string | undefined;
  const lineArg = args.line as string | number | undefined;
  const rangeArg = args.range as string | undefined;
  const uncomment = args.uncomment === true;

  if (!file) {
    return { ok: false, error: "Missing required arg: file" };
  }

  if (!lineArg && !rangeArg) {
    return { ok: false, error: "Missing required arg: --line or --range" };
  }

  const absPath = resolve(file);

  if (!existsSync(absPath)) {
    return { ok: false, error: `File not found: ${absPath}` };
  }

  const projectRoot = findProjectRoot(absPath);
  const relativePath = relative(projectRoot, absPath);

  // ファイル内容を取得
  let content: string;
  try {
    content = bufferManager.getContent(absPath);
  } catch (err) {
    return {
      ok: false,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 言語に応じたコメント構文を取得
  const ext = extname(absPath).slice(1).toLowerCase();
  const syntax = COMMENT_SYNTAX[ext] || { line: "//" };

  const lines = content.split("\n");
  let startLine: number;
  let endLine: number;

  if (rangeArg) {
    // --range start:end
    const parts = rangeArg.split(":");
    startLine = parseInt(parts[0], 10);
    endLine = parseInt(parts[1], 10);
    if (isNaN(startLine) || isNaN(endLine)) {
      return { ok: false, error: "Invalid range format. Use --range start:end" };
    }
  } else {
    // --line N
    startLine = typeof lineArg === "number" ? lineArg : parseInt(lineArg as string, 10);
    endLine = startLine;
    if (isNaN(startLine)) {
      return { ok: false, error: "Invalid line number" };
    }
  }

  // 1-indexed を 0-indexed に変換
  startLine = Math.max(0, startLine - 1);
  endLine = Math.min(lines.length - 1, endLine - 1);

  if (startLine > endLine || startLine < 0 || endLine >= lines.length) {
    return { ok: false, error: `Invalid line range: ${startLine + 1}:${endLine + 1}` };
  }

  const oldContent = content;
  let action: string;

  if (uncomment) {
    // コメント解除
    for (let i = startLine; i <= endLine; i++) {
      lines[i] = removeComment(lines[i], syntax);
    }
    action = "uncommented";
  } else {
    // コメント追加
    if (startLine === endLine && syntax.line) {
      // 単一行 → 行コメント
      lines[startLine] = addLineComment(lines[startLine], syntax.line);
    } else if (syntax.blockStart && syntax.blockEnd) {
      // 複数行 → ブロックコメント
      lines[startLine] = syntax.blockStart + " " + lines[startLine];
      lines[endLine] = lines[endLine] + " " + syntax.blockEnd;
    } else if (syntax.line) {
      // ブロックコメントがない場合は各行に行コメント
      for (let i = startLine; i <= endLine; i++) {
        lines[i] = addLineComment(lines[i], syntax.line);
      }
    }
    action = "commented";
  }

  const newContent = lines.join("\n");

  if (newContent === oldContent) {
    return { ok: true, data: "no changes made" };
  }

  // 変更を適用
  bufferManager.setContent(absPath, newContent);
  bufferManager.flush(absPath);

  // Changeset を記録
  const changesetId = String(Date.now());
  const changeset: Changeset = {
    id: changesetId,
    timestamp: new Date().toISOString(),
    command: uncomment ? "uncomment" : "comment",
    description: `${action} lines ${startLine + 1}:${endLine + 1} in ${relativePath}`,
    changes: [
      {
        filePath: absPath,
        before: oldContent,
        after: newContent,
      },
    ],
  };
  await historyTracker.record(changeset);

  return { ok: true, data: `${action} lines ${startLine + 1}:${endLine + 1} in ${relativePath}` };
}

/**
 * 行コメントを追加する。
 */
function addLineComment(line: string, commentPrefix: string): string {
  const match = line.match(/^(\s*)/);
  const indent = match ? match[1] : "";
  const rest = line.slice(indent.length);
  return `${indent}${commentPrefix} ${rest}`;
}

/**
 * コメントを除去する。
 */
function removeComment(line: string, syntax: CommentSyntax): string {
  // 行コメントの除去
  if (syntax.line) {
    const linePattern = new RegExp(`^(\\s*)${escapeRegex(syntax.line)}\\s?`);
    if (linePattern.test(line)) {
      return line.replace(linePattern, "$1");
    }
  }

  // ブロックコメントの開始/終了を除去
  let result = line;
  if (syntax.blockStart) {
    result = result.replace(new RegExp(escapeRegex(syntax.blockStart) + "\\s?"), "");
  }
  if (syntax.blockEnd) {
    result = result.replace(new RegExp("\\s?" + escapeRegex(syntax.blockEnd)), "");
  }

  return result;
}

/**
 * 正規表現用にエスケープする。
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
