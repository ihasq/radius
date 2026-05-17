/**
 * Phase 18: codelens コマンドハンドラ。
 *
 * ファイルのコードレンズ情報を表示する。
 */

import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { findProjectRoot } from "../../shared/project";
import type { IpcResponse } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import type { LspCodeLens } from "../../lsp/types";

/**
 * codelens コマンドハンドラ。
 */
export async function handleCodeLens(
  args: Record<string, unknown>,
  lspManager: LspManager,
  bufferManager: BufferManager
): Promise<IpcResponse> {
  const file = args.file as string | undefined;

  if (!file) {
    return { ok: false, error: "Missing required arg: file" };
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
    return { ok: true, data: "no code lenses (no LSP for this file type)" };
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
  const lines = content.split("\n");

  // ドキュメントを開く
  client.openDocument(uri, languageId, content);

  try {
    // コードレンズを取得
    let lenses = await client.codeLens(uri);

    if (!lenses || lenses.length === 0) {
      client.closeDocument(uri);
      return { ok: true, data: "no code lenses" };
    }

    // 各レンズの詳細を取得
    const resolvedLenses: LspCodeLens[] = [];
    for (const lens of lenses) {
      try {
        const resolved = await client.codeLensResolve(lens);
        resolvedLenses.push(resolved);
      } catch {
        // resolve に失敗したレンズは元のまま
        resolvedLenses.push(lens);
      }
    }

    client.closeDocument(uri);

    // 出力を構築
    const output: string[] = [`codelens: ${relativePath}`, ""];

    let count = 0;
    for (const lens of resolvedLenses) {
      if (!lens.command) continue;

      const line = lens.range.start.line + 1;
      const lineContent = lines[lens.range.start.line] || "";

      // 関数名やクラス名を抽出
      const symbolMatch = lineContent.match(/(?:function|class|const|let|var|interface|type)\s+(\w+)/);
      const symbolName = symbolMatch ? symbolMatch[1] + "()" : `line ${line}`;

      output.push(`  ${symbolName} [line ${line}] - ${lens.command.title}`);
      count++;
    }

    if (count === 0) {
      return { ok: true, data: "no code lenses" };
    }

    output.push("", `${count} lens(es)`);

    return { ok: true, data: output.join("\n") };
  } catch (err) {
    client.closeDocument(uri);
    throw err;
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
    default:
      return "plaintext";
  }
}
