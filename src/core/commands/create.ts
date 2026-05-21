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
import { analyzeFileContext, formatContextSection } from "../../shared/context";

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
  const stdin = args.stdin as string | undefined;
  const force = args.force as boolean | undefined;

  if (!file) {
    return errorResponse("Missing required arg: file");
  }

  const absPath = resolve(file);

  // 既存ファイルチェック（--force がない場合のみ）
  const fileExists = existsSync(absPath);
  if (fileExists && !force) {
    return errorResponse("file already exists. Use --force to overwrite.");
  }

  // --force で上書きする場合、before 内容を記録
  let beforeContent = "";
  if (fileExists) {
    try {
      beforeContent = bufferManager.getContent(absPath);
    } catch {
      // ファイルがバッファにロードされていない場合は直接読む
      const { readFileSync } = await import("node:fs");
      beforeContent = readFileSync(absPath, "utf-8");
    }
  }

  // 親ディレクトリを作成
  const dir = dirname(absPath);
  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    return errorResponse(`Failed to create directory: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 内容は content > stdin > 空文字列の優先順位
  const fileContent = content || stdin || "";

  // BufferManager 経由でファイル作成または上書き
  try {
    if (fileExists) {
      // 既存ファイルを上書き
      bufferManager.setContent(absPath, fileContent);
    } else {
      // 新規ファイル作成
      bufferManager.open(absPath);
      if (fileContent) {
        bufferManager.insert(absPath, 0, fileContent);
      }
    }
    bufferManager.flush(absPath);
  } catch (err) {
    return errorResponse(`Failed to create file: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Changeset 記録（force の場合は before を記録）
  const changeset: Changeset = {
    id: String(Date.now()),
    timestamp: new Date().toISOString(),
    command: "create",
    description: `${absPath}`,
    changes: [
      {
        filePath: absPath,
        before: beforeContent,
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

  // Context情報を収集
  const ctx = analyzeFileContext(absPath, fileContent);
  const contextOutput = ctx ? formatContextSection(ctx) : "";

  // 変更メタデータを計算
  const lines = fileContent.split("\n");
  const changeMetadata = {
    filePath: absPath,
    startLine: 1,
    endLine: 0, // 新規ファイルなので before は 0 行
    newEndLine: lines.length,
  };

  const actionWord = force && fileExists ? "overwritten" : "created";

  return {
    ok: true,
    data: `${actionWord}: ${filepath(absPath)}\n\n${contentPreview}\n${diagnosticsOutput}${contextOutput}`,
    changes: [changeMetadata],
  };
}

