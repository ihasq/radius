/**
 * insert コマンドハンドラ。
 *
 * 指定行への文字列挿入。
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { findProjectRoot } from "../../shared/project";
import type { HistoryTracker } from "../history/tracker";
import type { Changeset } from "../history/types";
import type { IpcResponse } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import { collectDiagnostics, formatDiagnostics } from "../../lsp/diagnostics";

/**
 * insert コマンドハンドラ。
 */
export async function handleInsert(
  args: Record<string, unknown>,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
  bufferManager: BufferManager
): Promise<IpcResponse> {
  const file = args.file as string | undefined;
  const line = args.line as string | number | undefined;
  const text = args.text as string | undefined;

  if (!file || line === undefined || text === undefined) {
    return { ok: false, error: "Missing required args: file, line, text" };
  }

  const absPath = resolve(file);

  if (!existsSync(absPath)) {
    return { ok: false, error: `File not found: ${absPath}` };
  }

  const lineNum = typeof line === "number" ? line : parseInt(line, 10);

  if (isNaN(lineNum) || lineNum < 0) {
    return { ok: false, error: "Invalid line number" };
  }

  // BufferManager から情報を取得
  const lineCount = bufferManager.getLineCount(absPath);

  // 行番号チェック
  if (lineNum > lineCount) {
    return {
      ok: false,
      error: `Invalid line number: ${lineNum} (file has ${lineCount} lines)`,
    };
  }

  // 挿入位置のオフセットを計算
  let offset: number;
  if (lineNum === 0) {
    // ファイル先頭
    offset = 0;
  } else {
    // lineNum行目の末尾（次の行の先頭）
    offset = bufferManager.getOffsetAt(absPath, lineNum + 1, 1);
  }

  // Changeset用のbefore contentを取得
  const content = bufferManager.getContent(absPath);

  // 挿入実行（BufferManager 経由）
  const insertText = text + "\n";
  try {
    bufferManager.insert(absPath, offset, insertText);
    bufferManager.flush(absPath);
  } catch (err) {
    return {
      ok: false,
      error: `Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Changeset用のafter contentを取得
  const newContent = bufferManager.getContent(absPath);

  // Changeset 記録
  const changeset: Changeset = {
    id: String(Date.now()),
    timestamp: new Date().toISOString(),
    command: "insert",
    description: `${absPath} line ${lineNum}`,
    changes: [
      {
        filePath: absPath,
        before: content,
        after: newContent,
      },
    ],
  };

  await historyTracker.record(changeset);

  // 変更箇所のコンテキストを生成（挿入後の内容から）
  const lines = newContent.split("\n");
  const context = generateInsertContext(lines, lineNum);

  // LSP診断情報を収集
  const diagnosticReport = await collectDiagnostics(lspManager, absPath, newContent);
  const diagnosticsOutput = diagnosticReport
    ? `\ndiagnostics:\n${formatDiagnostics(diagnosticReport)}`
    : "";

  return {
    ok: true,
    data: `inserted at line ${lineNum} in ${absPath}\n\n${context}${diagnosticsOutput}`,
  };
}

/**
 * 挿入箇所の前後3行を行番号付きで出力する。
 */
function generateInsertContext(lines: string[], insertedAtLine: number): string {
  // 挿入後の行番号（insertedAtLine が 0 の場合は 1行目、それ以外は insertedAtLine + 1）
  const insertedLineIndex = insertedAtLine === 0 ? 0 : insertedAtLine;

  // 前後3行の範囲を計算
  const startLine = Math.max(0, insertedLineIndex - 3);
  const endLine = Math.min(lines.length - 1, insertedLineIndex + 3);

  // 出力生成
  const output: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const lineNum = String(i + 1).padStart(4, " ");
    const marker = i === insertedLineIndex ? ">" : " ";
    output.push(`${marker}${lineNum}: ${lines[i]}`);
  }

  return output.join("\n");
}
