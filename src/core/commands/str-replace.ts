/**
 * str-replace コマンドハンドラ。
 *
 * ファイル内の文字列を完全一致で置換（1箇所のみ）。
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
import { filepath, marker as colorMarker } from "../../shared/colors";

/**
 * str-replace コマンドハンドラ。
 */
export async function handleStrReplace(
  args: Record<string, unknown>,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
  bufferManager: BufferManager
): Promise<IpcResponse> {
  const file = args.file as string | undefined;
  const oldText = args.old as string | undefined;
  const newText = args.new as string | undefined;

  if (!file || oldText === undefined || newText === undefined) {
    return { ok: false, error: "Missing required args: file, old, new" };
  }

  const absPath = resolve(file);

  if (!existsSync(absPath)) {
    return { ok: false, error: `File not found: ${absPath}` };
  }

  // BufferManager からファイル内容を取得
  let content: string;
  try {
    content = bufferManager.getContent(absPath);
  } catch (err) {
    return {
      ok: false,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 出現箇所を検索
  const occurrences: number[] = [];
  let index = 0;
  while ((index = content.indexOf(oldText, index)) !== -1) {
    occurrences.push(index);
    index += oldText.length;
  }

  // 出現数チェック
  if (occurrences.length === 0) {
    return { ok: false, error: "no match found." };
  }

  if (occurrences.length > 1) {
    return {
      ok: false,
      error: `multiple matches found (${occurrences.length}). Use a more specific string.`,
    };
  }

  // 置換実行（BufferManager 経由）
  const offset = occurrences[0];
  try {
    bufferManager.delete(absPath, offset, oldText.length);
    bufferManager.insert(absPath, offset, newText);
    bufferManager.flush(absPath);
  } catch (err) {
    return {
      ok: false,
      error: `Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 変更後の内容を取得
  const newContent = bufferManager.getContent(absPath);

  // Changeset 記録
  const changeset: Changeset = {
    id: String(Date.now()),
    timestamp: new Date().toISOString(),
    command: "str-replace",
    description: `${absPath}`,
    changes: [
      {
        filePath: absPath,
        before: content,
        after: newContent,
      },
    ],
  };

  await historyTracker.record(changeset);

  // 変更箇所のコンテキストを生成
  const context = generateChangeContext(newContent, occurrences[0], oldText.length, newText.length);

  // LSP診断情報を収集
  const diagnosticReport = await collectDiagnostics(lspManager, absPath, newContent);
  const diagnosticsOutput = diagnosticReport
    ? `\ndiagnostics:\n${formatDiagnostics(diagnosticReport)}`
    : "";

  return {
    ok: true,
    data: `replaced 1 occurrence in ${filepath(absPath)}\n\n${context}${diagnosticsOutput}`,
  };
}

/**
 * 変更箇所の前後3行を行番号付きで出力する。
 */
function generateChangeContext(
  content: string,
  changeOffset: number,
  oldLength: number,
  newLength: number
): string {
  const lines = content.split("\n");

  // 変更箇所の行番号を特定（0-indexed）
  let currentOffset = 0;
  let changeLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length + 1; // +1 for newline
    if (currentOffset + lineLength > changeOffset) {
      changeLine = i;
      break;
    }
    currentOffset += lineLength;
  }

  // 前後3行の範囲を計算
  const startLine = Math.max(0, changeLine - 3);
  const endLine = Math.min(lines.length - 1, changeLine + 3);

  // 出力生成
  const output: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const lineNum = String(i + 1).padStart(4, " ");
    const marker = i === changeLine ? ">" : " ";
    const line = `${marker}${lineNum}: ${lines[i]}`;
    // マーカー行はカラー適用
    output.push(i === changeLine ? colorMarker(line) : line);
  }

  return output.join("\n");
}
