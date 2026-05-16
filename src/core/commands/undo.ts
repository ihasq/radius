/**
 * undo コマンドハンドラ。
 *
 * HistoryTrackerを使用して直前の操作を取り消す。
 */

import { resolve } from "node:path";
import { LspManager } from "../../lsp/manager";
import { findProjectRoot } from "../../shared/project";
import { HistoryTracker } from "../history/tracker";
import type { IpcResponse } from "../../shared/types";

/**
 * undo コマンドのエントリポイント。
 */
export async function handleUndo(
  args: Record<string, unknown>,
  lspManager: LspManager,
  historyTracker: HistoryTracker
): Promise<IpcResponse> {
  const changeset = await historyTracker.undo();

  if (!changeset) {
    return { ok: false, error: "No history to undo" };
  }

  // A2: 復元された各ファイルの didClose を送信
  const projectRoot = findProjectRoot(changeset.changes[0]?.filePath || "");
  const client = await lspManager.getClient(
    changeset.changes[0]?.filePath || "",
    projectRoot
  );

  if (client) {
    for (const change of changeset.changes) {
      const uri = `file://${change.filePath}`;
      client.closeDocument(uri);
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
    `undone: ${changeset.command} (${changeset.description})`,
    `timestamp: ${changeset.timestamp}`,
    `files restored: ${changeset.changes.length}`,
  ].join("\n");

  const body = changeset.changes
    .map((change) => `  - ${change.filePath}`)
    .join("\n");

  return header + "\n" + body;
}
