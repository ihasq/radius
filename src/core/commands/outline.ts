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
import { TsRad, type RadSymbol } from "@radius/rdsx-ts";
import type { RdsxRegistry } from "../../rdsx/registry";

/**
 * outline コマンドハンドラ。
 */
export async function handleOutline(
  args: Record<string, unknown>,
  lspManager: LspManager,
  bufferManager: BufferManager,
  rdsxRegistry: RdsxRegistry
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

  // ファイル内容を取得
  let content: string;
  try {
    content = bufferManager.getContent(absPath);
  } catch (err) {
    return errorResponse(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
  }

  // RdsxAnalyzer を使用（構文解析）
  const languageId = getLanguageId(absPath);
  if (languageId) {
    const provider = rdsxRegistry.getAnalyzer(languageId);
    if (provider) {
      return await generateProviderOutline(provider, absPath, relativePath, content);
    }
  }

  // LSPクライアントを取得
  const client = await lspManager.getClient(absPath, projectRoot);

  if (!client) {
    // LSP不可時のフォールバック
    return generateTextBasedOutline(absPath, relativePath, bufferManager);
  }

  // ドキュメントを開く（languageIdは既に取得済み）
  client.openDocument(uri, languageId, content);

  try {
    // シンボルツリーを取得
    const symbols = await client.getDocumentSymbols(uri);

    client.closeDocument(uri);

    if (!symbols || symbols.length === 0) {
      return { ok: true, data: "[LSP] no symbols found" };
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
 * RdsxAnalyzer を使用した outline 生成（depth-1: 構文解析のみ）。
 */
async function generateProviderOutline(
  provider: any,
  absPath: string,
  relativePath: string,
  content: string
): Promise<IpcResponse> {
  try {
    const symbols = await provider.getSymbols(absPath, content);

    if (symbols.length === 0) {
      return { ok: true, data: "=== TSRAD DEBUG v2 === no symbols found" };
    }

    // 出力生成
    const output: string[] = [`outline: ${relativePath}`, ""];
    let count = 0;

    function renderSymbols(syms: RadSymbol[], depth: number) {
      for (const sym of syms) {
        const indent = "  ".repeat(depth);
        const exported = sym.exported ? "export " : "";

        // 型シグネチャを追加
        let signature = "";
        if (sym.typeSignature) {
          if (sym.kind === "function") {
            signature = sym.typeSignature; // (params): returnType
          } else {
            signature = `: ${sym.typeSignature}`; // : type
          }
        }

        // uses: 情報を追加
        let usesInfo = "";
        if (sym.uses && sym.uses.length > 0) {
          usesInfo = ` → uses: ${sym.uses.join(", ")}`;
        }

        output.push(`${indent}${exported}${sym.kind} ${sym.name}${signature} [line ${sym.line}]${usesInfo}`);
        count++;

        if (sym.children && sym.children.length > 0) {
          renderSymbols(sym.children, depth + 1);
        }
      }
    }

    renderSymbols(symbols, 0);
    output.push("", `${count} symbol(s)`);

    // コンテキスト追加（depth-1: module specifier のみ）
    // TsRad を直接使用 (getExports/getImports は RdsxAnalyzer に未追加)
    const tsRad = new TsRad();
    const sourceFile = tsRad.parseFile(absPath, content);
    const exports = tsRad.getExports(sourceFile);
    const imports = tsRad.getImports(sourceFile);

    const contextLines: string[] = ["## context"];
    if (exports.length > 0) {
      contextLines.push(`exports: ${exports.join(", ")}`);
    }
    if (imports.length > 0) {
      const importModules = imports.map(imp => imp.moduleSpecifier);
      contextLines.push(`imports: ${importModules.join(", ")}`);
    }

    return { ok: true, data: output.join("\n") + "\n" + contextLines.join("\n") };
  } catch (err) {
    return errorResponse(`TsRad parse failed: ${err instanceof Error ? err.message : String(err)}`);
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
    return { ok: true, data: "[TextBased] no symbols found" };
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
