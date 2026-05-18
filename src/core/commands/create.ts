/**
 * create コマンドハンドラ。
 *
 * 新規ファイルの作成。
 */

import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { HistoryTracker } from "../history/tracker";
import type { Changeset } from "../history/types";
import type { IpcResponse } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import { collectAndFormatWithTracking } from "../../lsp/diagnostics";
import type { DiagnosticRegistry } from "../../lsp/diagnostic-registry";
import { filepath } from "../../shared/colors";
import { formatPreview, errorResponse } from "../../shared/output";

/**
 * create コマンドハンドラ。
 */
export async function handleCreate(
  args: Record<string, unknown>,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
  bufferManager: BufferManager,
  diagnosticRegistry: DiagnosticRegistry
): Promise<IpcResponse> {
  const file = args.file as string | undefined;
  const content = args.content as string | undefined;

  if (!file) {
    return errorResponse("Missing required arg: file");
  }

  const absPath = resolve(file);

  // 既存ファイルチェック
  if (existsSync(absPath)) {
    return errorResponse("file already exists.");
  }

  // 親ディレクトリを作成
  const dir = dirname(absPath);
  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    return errorResponse(`Failed to create directory: ${err instanceof Error ? err.message : String(err)}`);
  }

  const fileContent = content || "";

  // BufferManager 経由でファイル作成
  try {
    // 空バッファを開き、内容を挿入してフラッシュ
    bufferManager.open(absPath); // 新規ファイルなので空バッファが作成される
    if (fileContent) {
      bufferManager.insert(absPath, 0, fileContent);
    }
    bufferManager.flush(absPath);
  } catch (err) {
    return errorResponse(`Failed to create file: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Changeset 記録（before="" 形式）
  const changeset: Changeset = {
    id: String(Date.now()),
    timestamp: new Date().toISOString(),
    command: "create",
    description: `${absPath}`,
    changes: [
      {
        filePath: absPath,
        before: "",
        after: fileContent,
      },
    ],
  };

  await historyTracker.record(changeset);

  // ファイル内容を出力に含める
  const contentPreview = formatPreview(fileContent);

  // LSP診断情報を収集（ID付与・差分検出）
  const diagnosticsOutput = await collectAndFormatWithTracking(
    lspManager,
    diagnosticRegistry,
    absPath,
    fileContent
  );

  return {
    ok: true,
    data: `created: ${filepath(absPath)}\n\n${contentPreview}\n${diagnosticsOutput}`,
  };
}

