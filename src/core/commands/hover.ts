/**
 * Phase 18: hover コマンドハンドラ。
 *
 * 指定位置のホバー情報（型情報、ドキュメント）を表示する。
 */

import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { findProjectRoot } from "../../shared/project";
import type { IpcResponse } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import type { LspHover, LspMarkupContent } from "../../lsp/types";

/**
 * hover コマンドハンドラ。
 */
export async function handleHover(
  args: Record<string, unknown>,
  lspManager: LspManager,
  bufferManager: BufferManager
): Promise<IpcResponse> {
  const file = args.file as string | undefined;
  const line = args.line as number | string | undefined;
  const col = args.col as number | string | undefined;

  if (!file) {
    return { ok: false, error: "Missing required arg: file" };
  }

  if (line === undefined || col === undefined) {
    return { ok: false, error: "Missing required args: --line and --col" };
  }

  const absPath = resolve(file);

  if (!existsSync(absPath)) {
    return { ok: false, error: `File not found: ${absPath}` };
  }

  const projectRoot = findProjectRoot(absPath);
  const uri = `file://${absPath}`;
  const relativePath = relative(projectRoot, absPath);

  // LSPクライアントを取得
  const client = await lspManager.getClient(absPath, projectRoot);
  if (!client) {
    return { ok: true, data: "hover unavailable (no LSP for this file type)" };
  }

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

  const languageId = getLanguageId(absPath);

  // 1-indexed から 0-indexed に変換
  const lineNum = (typeof line === "string" ? parseInt(line, 10) : line) - 1;
  const colNum = (typeof col === "string" ? parseInt(col, 10) : col) - 1;

  // ドキュメントを開く
  client.openDocument(uri, languageId, content);

  try {
    // ホバー情報を取得
    const hover = await client.hover(uri, { line: lineNum, character: colNum });

    client.closeDocument(uri);

    if (!hover) {
      return { ok: true, data: "no information at this position" };
    }

    // 出力を構築
    const output: string[] = [
      `${relativePath}:${lineNum + 1}:${colNum + 1}`,
      "",
    ];

    const hoverText = extractHoverText(hover);
    if (hoverText) {
      output.push(hoverText);
    } else {
      return { ok: true, data: "no information at this position" };
    }

    return { ok: true, data: output.join("\n") };
  } catch (err) {
    client.closeDocument(uri);
    throw err;
  }
}

/**
 * LspHover からテキストを抽出する。
 */
function extractHoverText(hover: LspHover): string {
  const { contents } = hover;

  if (typeof contents === "string") {
    return contents;
  }

  if (Array.isArray(contents)) {
    const parts: string[] = [];
    for (const item of contents) {
      if (typeof item === "string") {
        parts.push(item);
      } else if (isMarkupContent(item)) {
        parts.push(item.value);
      }
    }
    return parts.join("\n\n");
  }

  if (isMarkupContent(contents)) {
    return contents.value;
  }

  return "";
}

/**
 * LspMarkupContent かどうかを判定する。
 */
function isMarkupContent(obj: unknown): obj is LspMarkupContent {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "kind" in obj &&
    "value" in obj
  );
}

/**
 * ファイル拡張子から言語IDを取得する。
 */
function getLanguageId(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "html";
    default:
      return "plaintext";
  }
}
