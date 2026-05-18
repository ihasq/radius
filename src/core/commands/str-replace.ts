/**
 * str-replace コマンドハンドラ。
 *
 * ファイル内の文字列を完全一致で置換（1箇所のみ）。
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { HistoryTracker } from "../history/tracker";
import type { Changeset } from "../history/types";
import type { IpcResponse, ChangeMetadata } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import type { DiagnosticRegistry } from "../../lsp/diagnostic-registry";
import { collectAndFormatWithTracking } from "../../lsp/diagnostics";
import { filepath } from "../../shared/colors";
import { formatContext, errorResponse } from "../../shared/output";

/**
 * str-replace コマンドハンドラ。
 */
export async function handleStrReplace(
  args: Record<string, unknown>,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
  bufferManager: BufferManager,
  diagnosticRegistry: DiagnosticRegistry
): Promise<IpcResponse> {
  const file = args.file as string | undefined;
  const oldText = args.old as string | undefined;
  const newText = args.new as string | undefined;

  if (!file || oldText === undefined || newText === undefined) {
    return errorResponse("Missing required args: file, old, new");
  }

  const absPath = resolve(file);

  if (!existsSync(absPath)) {
    return errorResponse(`File not found: ${absPath}`);
  }

  // BufferManager からファイル内容を取得
  let content: string;
  try {
    content = bufferManager.getContent(absPath);
  } catch (err) {
    return errorResponse(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
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
    return errorResponse("no match found.");
  }

  if (occurrences.length > 1) {
    return errorResponse(`multiple matches found (${occurrences.length}). Use a more specific string.`);
  }

  // 置換実行（BufferManager 経由）
  const offset = occurrences[0];
  try {
    bufferManager.delete(absPath, offset, oldText.length);
    bufferManager.insert(absPath, offset, newText);
    bufferManager.flush(absPath);
  } catch (err) {
    return errorResponse(`Failed to write file: ${err instanceof Error ? err.message : String(err)}`);
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
  const lines = newContent.split("\n");
  const changeLine = getLineFromOffset(newContent, occurrences[0]);
  const context = formatContext({ lines, highlightLines: [changeLine] });

  // LSP診断情報を収集（ID付与・差分検出）
  const diagnosticsOutput = await collectAndFormatWithTracking(
    lspManager,
    diagnosticRegistry,
    absPath,
    newContent
  );

  // Phase 16: 変更メタデータを計算
  const changeMetadata = calculateChangeMetadata(content, newContent, occurrences[0], oldText, newText, absPath);

  return {
    ok: true,
    data: `replaced 1 occurrence in ${filepath(absPath)}\n\n${context}\n${diagnosticsOutput}`,
    changes: changeMetadata ? [changeMetadata] : undefined,
  };
}

/**
 * Phase 16: 変更メタデータを計算する。
 */
function calculateChangeMetadata(
  oldContent: string,
  _newContent: string,
  changeOffset: number,
  oldText: string,
  newText: string,
  filePath: string
): ChangeMetadata | null {
  const oldLines = oldContent.split("\n");

  // 変更開始行を特定（1-indexed）
  let currentOffset = 0;
  let startLine = 1;
  for (let i = 0; i < oldLines.length; i++) {
    if (currentOffset + oldLines[i].length >= changeOffset) {
      startLine = i + 1;
      break;
    }
    currentOffset += oldLines[i].length + 1; // +1 for newline
  }

  // 変更前の終了行を計算
  const oldTextLines = oldText.split("\n");
  const endLine = startLine + oldTextLines.length - 1;

  // 変更後の終了行を計算
  const newTextLines = newText.split("\n");
  const newEndLine = startLine + newTextLines.length - 1;

  return {
    filePath,
    startLine,
    endLine,
    newEndLine,
  };
}

/**
 * オフセット位置から行番号を取得する（0-indexed）。
 */
function getLineFromOffset(content: string, offset: number): number {
  const lines = content.split("\n");
  let currentOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length + 1;
    if (currentOffset + lineLength > offset) {
      return i;
    }
    currentOffset += lineLength;
  }
  return lines.length - 1;
}
