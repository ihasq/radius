/**
 * Phase 19: tokens コマンドハンドラ。
 *
 * セマンティックトークンを取得して表示する。
 */

import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { findProjectRoot } from "../../shared/project";
import type { IpcResponse } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import { errorResponse } from "../../shared/output";

/** セマンティックトークンタイプ（標準的な定義）。 */
const TOKEN_TYPES = [
  "namespace",
  "type",
  "class",
  "enum",
  "interface",
  "struct",
  "typeParameter",
  "parameter",
  "variable",
  "property",
  "enumMember",
  "event",
  "function",
  "method",
  "macro",
  "keyword",
  "modifier",
  "comment",
  "string",
  "number",
  "regexp",
  "operator",
];

/** セマンティックトークン修飾子。 */
const TOKEN_MODIFIERS = [
  "declaration",
  "definition",
  "readonly",
  "static",
  "deprecated",
  "abstract",
  "async",
  "modification",
  "documentation",
  "defaultLibrary",
];

/**
 * tokens コマンドハンドラ。
 */
export async function handleTokens(
  args: Record<string, unknown>,
  lspManager: LspManager,
  bufferManager: BufferManager
): Promise<IpcResponse> {
  const file = args.file as string | undefined;
  const rangeArg = args.range as string | undefined;

  if (!file) {
    return errorResponse("Missing required arg: file");
  }

  const absPath = resolve(file);

  if (!existsSync(absPath)) {
    return errorResponse(`File not found: ${absPath}`);
  }

  const projectRoot = findProjectRoot(absPath);
  const relativePath = relative(projectRoot, absPath);
  const uri = `file://${absPath}`;

  // ファイル拡張子をチェック
  const ext = absPath.split(".").pop()?.toLowerCase();
  if (!["ts", "tsx", "js", "jsx"].includes(ext || "")) {
    return { ok: true, data: "semantic tokens unavailable (unsupported file type)" };
  }

  // LSPクライアントを取得
  const client = await lspManager.getClient(absPath, projectRoot);
  if (!client) {
    return { ok: true, data: "semantic tokens unavailable (no LSP for this file type)" };
  }

  // ファイル内容を取得
  let content: string;
  try {
    content = bufferManager.getContent(absPath);
  } catch (err) {
    return errorResponse(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
  }

  const languageId = getLanguageId(absPath);

  // ドキュメントを開く
  client.openDocument(uri, languageId, content);

  try {
    let tokens: { data: number[] };
    const lines = content.split("\n");

    if (rangeArg) {
      // --range start:end
      const parts = rangeArg.split(":");
      const startLine = parseInt(parts[0], 10) - 1;
      const endLine = parseInt(parts[1], 10) - 1;

      if (isNaN(startLine) || isNaN(endLine)) {
        client.closeDocument(uri);
        return errorResponse("Invalid range format. Use --range start:end");
      }

      const range = {
        start: { line: startLine, character: 0 },
        end: { line: endLine, character: lines[endLine]?.length || 0 },
      };

      tokens = await client.semanticTokensRange(uri, range);
    } else {
      tokens = await client.semanticTokensFull(uri);
    }

    client.closeDocument(uri);

    if (!tokens || !tokens.data || tokens.data.length === 0) {
      return { ok: true, data: `tokens: ${relativePath}\n\nno semantic tokens found` };
    }

    // トークンをデコード
    const decoded = decodeTokens(tokens.data, lines);

    // 出力を生成
    const output: string[] = [`tokens: ${relativePath}`, ""];

    if (rangeArg) {
      output.push(`range: ${rangeArg}`, "");
    }

    for (const token of decoded) {
      const modifierStr = token.modifiers.length > 0 ? ` [${token.modifiers.join(", ")}]` : "";
      output.push(`line ${token.line}: ${token.type}${modifierStr} "${token.text}"`);
    }

    output.push("", `total: ${decoded.length} tokens`);

    return { ok: true, data: output.join("\n") };
  } catch (err) {
    client.closeDocument(uri);
    return { ok: true, data: "semantic tokens unavailable (LSP does not support semantic tokens)" };
  }
}

interface DecodedToken {
  line: number;
  column: number;
  length: number;
  type: string;
  modifiers: string[];
  text: string;
}

/**
 * セマンティックトークンデータをデコードする。
 *
 * LSP のセマンティックトークンは相対エンコーディングを使用:
 * [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]
 */
function decodeTokens(data: number[], lines: string[]): DecodedToken[] {
  const tokens: DecodedToken[] = [];
  let currentLine = 0;
  let currentColumn = 0;

  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaStartChar = data[i + 1];
    const length = data[i + 2];
    const tokenTypeIndex = data[i + 3];
    const tokenModifiersBitset = data[i + 4];

    if (deltaLine > 0) {
      currentLine += deltaLine;
      currentColumn = deltaStartChar;
    } else {
      currentColumn += deltaStartChar;
    }

    const tokenType = TOKEN_TYPES[tokenTypeIndex] || `unknown(${tokenTypeIndex})`;
    const modifiers = decodeModifiers(tokenModifiersBitset);

    // テキストを取得
    const lineContent = lines[currentLine] || "";
    const text = lineContent.slice(currentColumn, currentColumn + length);

    tokens.push({
      line: currentLine + 1, // 1-indexed
      column: currentColumn + 1,
      length,
      type: tokenType,
      modifiers,
      text,
    });
  }

  return tokens;
}

/**
 * モディファイアのビットセットをデコードする。
 */
function decodeModifiers(bitset: number): string[] {
  const modifiers: string[] = [];
  for (let i = 0; i < TOKEN_MODIFIERS.length; i++) {
    if (bitset & (1 << i)) {
      modifiers.push(TOKEN_MODIFIERS[i]);
    }
  }
  return modifiers;
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
    default:
      return "plaintext";
  }
}
