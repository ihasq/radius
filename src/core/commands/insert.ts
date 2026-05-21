/**
 * insert コマンドハンドラ。
 *
 * 指定行への文字列挿入。
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { HistoryTracker } from "../history/tracker";
import type { Changeset } from "../history/types";
import type { IpcResponse } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import { collectAndFormatWithTracking } from "../../lsp/diagnostics";
import type { DiagnosticRegistry } from "../../lsp/diagnostic-registry";
import { filepath, added } from "../../shared/colors";
import { formatContext, errorResponse } from "../../shared/output";

/**
 * insert コマンドハンドラ。
 */
export async function handleInsert(
  args: Record<string, unknown>,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
  bufferManager: BufferManager,
  diagnosticRegistry: DiagnosticRegistry
): Promise<IpcResponse> {
  const file = args.file as string | undefined;
  const line = args.line as string | number | undefined;
  const text = args.text as string | undefined;

  if (!file || line === undefined || text === undefined) {
    return errorResponse("Missing required args: file, line, text");
  }

  const absPath = resolve(file);

  if (!existsSync(absPath)) {
    return errorResponse(`File not found: ${absPath}`);
  }

  const lineNum = typeof line === "number" ? line : parseInt(line, 10);

  if (isNaN(lineNum) || lineNum < 0) {
    return errorResponse("Invalid line number");
  }

  // BufferManager から情報を取得
  const lineCount = bufferManager.getLineCount(absPath);

  // 行番号チェック
  if (lineNum > lineCount) {
    return errorResponse(`Invalid line number: ${lineNum} (file has ${lineCount} lines)`);
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
    return errorResponse(`Failed to write file: ${err instanceof Error ? err.message : String(err)}`);
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
  const insertedLineIndex = lineNum === 0 ? 0 : lineNum;
  const context = formatContext({ lines, highlightLines: [insertedLineIndex], colorFn: added });

  // LSP診断情報を収集（ID付与・差分検出）
  const diagnosticsOutput = await collectAndFormatWithTracking(
    lspManager,
    diagnosticRegistry,
    absPath,
    newContent
  );

  // 変更メタデータを計算
  const insertedLines = text.split("\n");
  const changeMetadata = {
    filePath: absPath,
    startLine: lineNum,
    endLine: lineNum - 1, // 挿入なので before は空
    newEndLine: lineNum + insertedLines.length - 1,
  };

  return {
    ok: true,
    data: `inserted at line ${lineNum} in ${filepath(absPath)}\n\n${context}\n${diagnosticsOutput}`,
    changes: [changeMetadata],
  };
}

