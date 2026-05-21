/**
 * Phase 19: tokens コマンドハンドラ。
 *
 * セマンティックトークンを取得して表示する。
 * depth-2: TypeScript ファイルは TsRad (Language Service) で処理
 */

import ts from "typescript";
import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { findProjectRoot } from "../../shared/project";
import type { IpcResponse } from "../../shared/types";
import type { LspClient } from "../../lsp/client";
import type { BufferManager } from "../buffer/manager";
import { errorResponse } from "../../shared/output";
import type { TsRadManager } from "@radius/radls-ts/manager";

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
  lspClient: LspClient | null,
  bufferManager: BufferManager,
  tsRadManager: TsRadManager
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

  // ファイル内容を取得
  let content: string;
  try {
    content = bufferManager.getContent(absPath);
  } catch (err) {
    return errorResponse(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
  }

  // TypeScript ファイルの場合は TsRad (depth-2) を使用
  const isTypeScript = ["ts", "tsx"].includes(ext || "");
  if (isTypeScript) {
    return handleTsRadTokens(absPath, relativePath, content, projectRoot, rangeArg, tsRadManager);
  }

  // LSPクライアントを使用
  const client = lspClient;
  if (!client) {
    return { ok: true, data: "semantic tokens unavailable (no LSP for this file type)" };
  }

  try {
    let tokens: { data: number[] };
    const lines = content.split("\n");

    if (rangeArg) {
      // --range start:end
      const parts = rangeArg.split(":");
      const startLine = parseInt(parts[0], 10) - 1;
      const endLine = parseInt(parts[1], 10) - 1;

      if (isNaN(startLine) || isNaN(endLine)) {
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
 * TsRad (depth-2) を使用してセマンティックトークンを取得する。
 */
function handleTsRadTokens(
  absPath: string,
  relativePath: string,
  content: string,
  projectRoot: string,
  rangeArg: string | undefined,
  tsRadManager: TsRadManager
): IpcResponse {
  // TsRadManager から Language Service を取得
  const service = tsRadManager.getService(projectRoot, 2, absPath, content);

  try {
    const sourceFile = service.getProgram()?.getSourceFile(absPath);
    if (!sourceFile) {
      return { ok: true, data: `tokens: ${relativePath}\n\nno semantic tokens found` };
    }

    const lines = content.split("\n");
    const tokens: TokenInfo[] = [];

    // 範囲指定がある場合
    let startLine = 0;
    let endLine = lines.length - 1;
    if (rangeArg) {
      const parts = rangeArg.split(":");
      startLine = parseInt(parts[0], 10) - 1;
      endLine = parseInt(parts[1], 10) - 1;
    }

    // ソースファイルからトークンを抽出
    function visit(node: ts.Node) {
      const pos = sourceFile!.getLineAndCharacterOfPosition(node.getStart());
      const line = pos.line;

      // 範囲外はスキップ
      if (line < startLine || line > endLine) {
        return;
      }

      const tokenType = getTokenType(node);
      const text = node.getText(sourceFile);

      if (tokenType) {
        tokens.push({
          line: line + 1,
          type: tokenType,
          text: text,
        });
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    if (tokens.length === 0) {
      return { ok: true, data: `tokens: ${relativePath}\n\nno semantic tokens found` };
    }

    // 出力を生成
    const output: string[] = [`tokens: ${relativePath}`, ""];

    if (rangeArg) {
      output.push(`range: ${rangeArg}`, "");
    }

    for (const token of tokens) {
      output.push(`line ${token.line}: ${token.type} "${token.text}"`);
    }

    output.push("", `total: ${tokens.length} tokens`);

    return { ok: true, data: output.join("\n") };
  } catch (err) {
    return errorResponse(`TsRad tokens failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

interface TokenInfo {
  line: number;
  type: string;
  text: string;
}

/**
 * ノードからトークンタイプを取得する。
 */
function getTokenType(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    return "function";
  }
  if (ts.isMethodDeclaration(node)) {
    return "method";
  }
  if (ts.isClassDeclaration(node)) {
    return "class";
  }
  if (ts.isInterfaceDeclaration(node)) {
    return "interface";
  }
  if (ts.isTypeAliasDeclaration(node)) {
    return "type";
  }
  if (ts.isVariableDeclaration(node)) {
    return "variable";
  }
  if (ts.isParameter(node)) {
    return "parameter";
  }
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
    return "property";
  }
  if (ts.isEnumDeclaration(node)) {
    return "enum";
  }
  return null;
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
