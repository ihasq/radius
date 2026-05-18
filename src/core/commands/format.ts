/**
 * Phase 17: format コマンドハンドラ。
 *
 * LSPのドキュメントフォーマットを適用する。
 */

import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { findProjectRoot } from "../../shared/project";
import type { HistoryTracker } from "../history/tracker";
import type { Changeset } from "../history/types";
import type { IpcResponse, ChangeMetadata } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import { resolveLanguageId } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import { collectDiagnostics, formatDiagnostics } from "../../lsp/diagnostics";
import { filepath } from "../../shared/colors";
import type { LspTextEdit } from "../../lsp/types";

/**
 * format コマンドハンドラ。
 */
export async function handleFormat(
  args: Record<string, unknown>,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
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

  // LSPクライアントを取得
  const client = await lspManager.getClient(absPath, projectRoot);
  if (!client) {
    return { ok: true, data: "formatting unavailable (no LSP for this file type)" };
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

  const languageId = resolveLanguageId(absPath);

  // ドキュメントを開く
  client.openDocument(uri, languageId, content);

  try {
    // フォーマットオプション（プロジェクト設定から推定、デフォルトは2スペース）
    const options = {
      tabSize: 2,
      insertSpaces: true,
    };

    // フォーマットリクエスト
    const edits = await client.formatting(uri, options);

    if (edits.length === 0) {
      client.closeDocument(uri);
      return { ok: true, data: "no changes" };
    }

    // 編集を適用
    const originalContent = content;
    const result = applyTextEdits(content, edits);

    // 変更をファイルに書き込み
    bufferManager.setContent(absPath, result.newContent);
    bufferManager.flush(absPath);

    // Changeset 記録
    const changeset: Changeset = {
      id: String(Date.now()),
      timestamp: new Date().toISOString(),
      command: "format",
      description: `${absPath}`,
      changes: [
        {
          filePath: absPath,
          before: originalContent,
          after: result.newContent,
        },
      ],
    };
    await historyTracker.record(changeset);

    // 診断情報を収集
    client.changeDocument(uri, result.newContent);
    await new Promise(resolve => setTimeout(resolve, 300));

    const diagnosticReport = await collectDiagnostics(lspManager, absPath, result.newContent);
    const diagnosticsOutput = diagnosticReport
      ? `\ndiagnostics:\n${formatDiagnostics(diagnosticReport)}`
      : "\ndiagnostics: ok";

    client.closeDocument(uri);

    const relativePath = relative(projectRoot, absPath);

    // 変更メタデータを計算
    const changeMetadata: ChangeMetadata = {
      filePath: absPath,
      startLine: result.minLine + 1,
      endLine: result.maxLine + 1,
      newEndLine: result.minLine + 1 + (result.newContent.split("\n").length - originalContent.split("\n").length),
    };

    return {
      ok: true,
      data: `formatted: ${filepath(relativePath)}\nchanges: ${result.changedLines} line(s)${diagnosticsOutput}`,
      changes: [changeMetadata],
    };
  } catch (err) {
    client.closeDocument(uri);
    throw err;
  }
}

/**
 * TextEdit の配列をコンテンツに適用する。
 */
function applyTextEdits(
  content: string,
  edits: LspTextEdit[]
): { newContent: string; changedLines: number; minLine: number; maxLine: number } {
  // 編集を逆順にソート（末尾から適用）
  const sortedEdits = [...edits].sort((a, b) => {
    const lineDiff = b.range.start.line - a.range.start.line;
    if (lineDiff !== 0) return lineDiff;
    return b.range.start.character - a.range.start.character;
  });

  const lines = content.split("\n");
  let minLine = Infinity;
  let maxLine = -Infinity;

  for (const edit of sortedEdits) {
    minLine = Math.min(minLine, edit.range.start.line);
    maxLine = Math.max(maxLine, edit.range.end.line);

    // オフセットを計算
    const startOffset = getOffset(lines, edit.range.start.line, edit.range.start.character);
    const endOffset = getOffset(lines, edit.range.end.line, edit.range.end.character);

    // 文字列を置換
    const before = content.substring(0, startOffset);
    const after = content.substring(endOffset);
    content = before + edit.newText + after;
  }

  const changedLines = maxLine - minLine + 1;

  return {
    newContent: content,
    changedLines,
    minLine: minLine === Infinity ? 0 : minLine,
    maxLine: maxLine === -Infinity ? 0 : maxLine,
  };
}

/**
 * 行と列からオフセットを計算する。
 */
function getOffset(lines: string[], line: number, character: number): number {
  let offset = 0;
  for (let i = 0; i < line && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }
  offset += Math.min(character, lines[line]?.length || 0);
  return offset;
}

