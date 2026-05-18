/**
 * Phase 18: outline コマンドハンドラ。
 *
 * ファイルのシンボルツリーを表示する。
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { findProjectRoot } from "../../shared/project";
import type { IpcResponse } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import { SymbolKindNames, type LspDocumentSymbol } from "../../lsp/types";
import { errorResponse } from "../../shared/output";

/**
 * outline コマンドハンドラ。
 */
export async function handleOutline(
  args: Record<string, unknown>,
  lspManager: LspManager,
  bufferManager: BufferManager
): Promise<IpcResponse> {
  const file = args.file as string | undefined;

  if (!file) {
    return errorResponse("Missing required arg: file");
  }

  const absPath = resolve(file);

  if (!existsSync(absPath)) {
    return errorResponse(`File not found: ${absPath}`);
  }

  const projectRoot = findProjectRoot(absPath);
  const uri = `file://${absPath}`;
  const relativePath = relative(projectRoot, absPath);

  // LSPクライアントを取得
  const client = await lspManager.getClient(absPath, projectRoot);

  if (!client) {
    // LSP不可時のフォールバック
    return generateTextBasedOutline(absPath, relativePath, bufferManager);
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
    // シンボルツリーを取得
    const symbols = await client.getDocumentSymbols(uri);

    client.closeDocument(uri);

    if (!symbols || symbols.length === 0) {
      return { ok: true, data: "no symbols found" };
    }

    // 出力生成
    const output: string[] = [`outline: ${relativePath}`, ""];
    let count = 0;

    function renderSymbols(syms: LspDocumentSymbol[], depth: number) {
      for (const sym of syms) {
        const indent = "  ".repeat(depth);
        const kindName = SymbolKindNames[sym.kind] || "unknown";
        const line = sym.range.start.line + 1;
        output.push(`${indent}${kindName.toLowerCase()} ${sym.name} [line ${line}]`);
        count++;

        if (sym.children && sym.children.length > 0) {
          renderSymbols(sym.children, depth + 1);
        }
      }
    }

    renderSymbols(symbols, 0);
    output.push("", `${count} symbol(s)`);

    return { ok: true, data: output.join("\n") };
  } catch (err) {
    client.closeDocument(uri);
    throw err;
  }
}

/**
 * LSP不可時のテキストベースoutline生成。
 */
function generateTextBasedOutline(
  absPath: string,
  relativePath: string,
  bufferManager: BufferManager
): IpcResponse {
  let content: string;
  try {
    content = bufferManager.getContent(absPath);
  } catch {
    try {
      content = readFileSync(absPath, "utf-8");
    } catch (err) {
      return errorResponse(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const output: string[] = [
    "%% text-based outline (LSP unavailable)",
    `outline: ${relativePath}`,
    "",
  ];
  let count = 0;
  const lines = content.split("\n");

  // 簡易パターンマッチング
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // function/class/const/export のパターン
    const funcMatch = line.match(/^\s*(export\s+)?(async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      output.push(`function ${funcMatch[3]} [line ${lineNum}]`);
      count++;
      continue;
    }

    const classMatch = line.match(/^\s*(export\s+)?class\s+(\w+)/);
    if (classMatch) {
      output.push(`class ${classMatch[2]} [line ${lineNum}]`);
      count++;
      continue;
    }

    const constMatch = line.match(/^\s*(export\s+)?const\s+(\w+)/);
    if (constMatch) {
      output.push(`variable ${constMatch[2]} [line ${lineNum}]`);
      count++;
      continue;
    }

    const interfaceMatch = line.match(/^\s*(export\s+)?interface\s+(\w+)/);
    if (interfaceMatch) {
      output.push(`interface ${interfaceMatch[2]} [line ${lineNum}]`);
      count++;
      continue;
    }

    const typeMatch = line.match(/^\s*(export\s+)?type\s+(\w+)/);
    if (typeMatch) {
      output.push(`type ${typeMatch[2]} [line ${lineNum}]`);
      count++;
      continue;
    }
  }

  if (count === 0) {
    return { ok: true, data: "no symbols found" };
  }

  output.push("", `${count} symbol(s)`);

  return { ok: true, data: output.join("\n") };
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
    case "py":
      return "python";
    default:
      return "plaintext";
  }
}
