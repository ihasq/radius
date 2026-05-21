/**
 * undo コマンドハンドラ。
 *
 * HistoryTrackerを使用して直前の操作を取り消す。
 */

import { LspManager } from "../../lsp/manager";
import { findProjectRoot } from "../../shared/project";
import { HistoryTracker } from "../history/tracker";
import type { TsRadManager } from "@radius/radls-ts/manager";
import type { IpcResponse } from "../../shared/types";
import { filepath, warning as colorWarning } from "../../shared/colors";
import { errorResponse } from "../../shared/output";
import { readFileSync } from "node:fs";

/**
 * undo コマンドのエントリポイント。
 */
export async function handleUndo(
  _args: Record<string, unknown>,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
  tsRadManager?: TsRadManager
): Promise<IpcResponse> {
  const changeset = await historyTracker.undo();

  if (!changeset) {
    return errorResponse("No history to undo");
  }

  // undo でファイル復元後、TsRadManager に変更を通知
  for (const change of changeset.changes) {
    const projectRoot = findProjectRoot(change.filePath);
    try {
      const content = readFileSync(change.filePath, "utf-8");
      tsRadManager?.notifyFileChange(projectRoot, change.filePath, content);
    } catch {
      // ファイルが存在しない場合はスキップ
    }
  }

  // 出力フォーマット
  const output = formatOutput(changeset);
  return { ok: true, data: output };
}

/**
 * LLM向けの出力フォーマット。
 */
function formatOutput(changeset: {
  id: string;
  timestamp: string;
  command: string;
  description: string;
  changes: Array<{ filePath: string; before: string; after: string }>;
}): string {
  const header = [
    colorWarning(`undone: ${changeset.command} (${changeset.description})`),
    `timestamp: ${changeset.timestamp}`,
    `files restored: ${changeset.changes.length}`,
  ].join("\n");

  const body = changeset.changes
    .map((change) => `  - ${filepath(change.filePath)}`)
    .join("\n");

  return header + "\n" + body;
}
