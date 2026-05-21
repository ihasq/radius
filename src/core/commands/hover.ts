/**
 * Phase 18: hover コマンドハンドラ。
 *
 * 指定位置のホバー情報（型情報、ドキュメント）を表示する。
 * depth-2: TypeScript ファイルは TsRad (Language Service) で処理
 */

import ts from "typescript";
import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { findProjectRoot } from "../../shared/project";
import type { IpcResponse } from "../../shared/types";
import type { LspClient } from "../../lsp/client";
import type { BufferManager } from "../buffer/manager";
import type { LspHover, LspMarkupContent } from "../../lsp/types";
import { errorResponse } from "../../shared/output";
import type { TsRadManager } from "../ts-service/manager";

/**
 * hover コマンドハンドラ。
 */
export async function handleHover(
  args: Record<string, unknown>,
  lspClient: LspClient | null,
  bufferManager: BufferManager,
  tsRadManager: TsRadManager
): Promise<IpcResponse> {
  const file = args.file as string | undefined;
  const line = args.line as number | string | undefined;
  const col = args.col as number | string | undefined;

  if (!file) {
    return errorResponse("Missing required arg: file");
  }

  if (line === undefined || col === undefined) {
    return errorResponse("Missing required args: --line and --col");
  }

  const absPath = resolve(file);

  if (!existsSync(absPath)) {
    return errorResponse(`File not found: ${absPath}`);
  }

  const projectRoot = findProjectRoot(absPath);
  const uri = `file://${absPath}`;
  const relativePath = relative(projectRoot, absPath);

  // ファイル内容を取得
  let content: string;
  try {
    content = bufferManager.getContent(absPath);
  } catch (err) {
    return errorResponse(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
  }

  // TypeScript ファイルの場合は TsRad (depth-2) を使用
  const isTypeScript = absPath.endsWith(".ts") || absPath.endsWith(".tsx");
  if (isTypeScript) {
    return handleTsRadHover(absPath, relativePath, content, projectRoot, line, col, tsRadManager);
  }

  // LSPクライアントを使用
  const client = lspClient;
  if (!client) {
    return { ok: true, data: "hover unavailable (no LSP for this file type)" };
  }

  // 1-indexed から 0-indexed に変換
  const lineNum = (typeof line === "string" ? parseInt(line, 10) : line) - 1;
  const colNum = (typeof col === "string" ? parseInt(col, 10) : col) - 1;

  try {
    // ホバー情報を取得
    const hover = await client.hover(uri, { line: lineNum, character: colNum });

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
 * TsRad (depth-2) を使用してホバー情報を取得する。
 */
function handleTsRadHover(
  absPath: string,
  relativePath: string,
  content: string,
  projectRoot: string,
  line: number | string | undefined,
  col: number | string | undefined,
  tsRadManager: TsRadManager
): IpcResponse {
  // 1-indexed から 0-indexed に変換
  const lineNum = (typeof line === "string" ? parseInt(line, 10) : line as number) - 1;
  const colNum = (typeof col === "string" ? parseInt(col, 10) : col as number) - 1;

  // ファイル内容を TsRadManager に通知（Language Service のキャッシュに追加）
  tsRadManager.notifyFileChange(projectRoot, absPath, content);

  // TsRadManager から Language Service を取得
  const service = tsRadManager.getService(projectRoot, 2, absPath, content);

  try {
    // ファイル内の位置を計算
    const lines = content.split("\n");
    let position = 0;
    for (let i = 0; i < lineNum; i++) {
      position += lines[i].length + 1; // +1 for newline
    }
    position += colNum;

    // QuickInfo を取得
    const quickInfo = service.getQuickInfoAtPosition(absPath, position);

    if (!quickInfo) {
      return { ok: true, data: "no information at this position" };
    }

    // 出力を構築
    const output: string[] = [
      `${relativePath}:${lineNum + 1}:${colNum + 1}`,
      "",
    ];

    // displayParts からテキストを抽出
    const displayText = quickInfo.displayParts
      ?.map(part => part.text)
      .join("");

    if (displayText) {
      output.push(displayText);
    }

    // ドキュメント文字列があれば追加
    const docText = quickInfo.documentation
      ?.map(part => part.text)
      .join("");

    if (docText) {
      output.push("", docText);
    }

    return { ok: true, data: output.join("\n") };
  } catch (err) {
    return errorResponse(`TsRad hover failed: ${err instanceof Error ? err.message : String(err)}`);
  }
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
