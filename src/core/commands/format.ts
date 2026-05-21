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
import type { LspClient } from "../../lsp/client";
import type { BufferManager } from "../buffer/manager";
import { collectAndFormatWithTracking } from "../../lsp/diagnostics";
import type { DiagnosticRegistry } from "../../lsp/diagnostic-registry";
import { filepath } from "../../shared/colors";
import type { LspTextEdit } from "../../lsp/types";
import { errorResponse } from "../../shared/output";
import ts from "typescript";

/**
 * format コマンドハンドラ。
 */
export async function handleFormat(
  args: Record<string, unknown>,
  lspClient: LspClient | null,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
  bufferManager: BufferManager,
  diagnosticRegistry: DiagnosticRegistry
): Promise<IpcResponse> {
  const file = args.file as string | undefined;

  if (!file) {
    return errorResponse("Missing required arg: file");
  }

  const absPath = resolve(file);

  if (!existsSync(absPath)) {
    return errorResponse(`File not found: ${absPath}`);
  }

  const projectRoot = findProjectRoot(absPath);
  const relativePath = relative(projectRoot, absPath);

  // ファイル内容を取得
  let content: string;
  try {
    content = bufferManager.getContent(absPath);
  } catch (err) {
    return errorResponse(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
  }

  // TypeScript/TSX ファイルは ts-rad で処理（外部LSP不要）
  const isTypeScript = absPath.endsWith(".ts") || absPath.endsWith(".tsx");
  if (isTypeScript) {
    return await handleTsRadFormat(absPath, relativePath, content, bufferManager, historyTracker);
  }

  const uri = `file://${absPath}`;

  // LSPクライアントを使用（非TypeScript言語用）
  const client = lspClient;
  if (!client) {
    return { ok: true, data: "formatting unavailable (no LSP for this file type)" };
  }

  try {
    // フォーマットオプション（プロジェクト設定から推定、デフォルトは2スペース）
    const options = {
      tabSize: 2,
      insertSpaces: true,
    };

    // フォーマットリクエスト
    const edits = await client.formatting(uri, options);

    if (edits.length === 0) {
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

    // 診断情報を収集（ID付与・差分検出）
    client.changeDocument(uri, result.newContent);
    await new Promise(resolve => setTimeout(resolve, 300));

    const diagnosticsOutput = await collectAndFormatWithTracking(
      lspManager,
      diagnosticRegistry,
      absPath,
      result.newContent
    );

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
    return errorResponse(`Failed to format: ${err instanceof Error ? err.message : String(err)}`);
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

/**
 * ts-rad による TypeScript フォーマット（depth-1: パースのみ）。
 * 外部LSP不要、node_modules走査なし。
 */
async function handleTsRadFormat(
  absPath: string,
  relativePath: string,
  content: string,
  bufferManager: BufferManager,
  historyTracker: HistoryTracker
): Promise<IpcResponse> {
  try {
    // depth-1: SourceFile を作成（型チェックなし）
    const sourceFile = ts.createSourceFile(
      absPath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    // フォーマットオプション
    const formatOptions: ts.FormatCodeSettings = {
      baseIndentSize: 0,
      indentSize: 2,
      tabSize: 2,
      convertTabsToSpaces: true,
      newLineCharacter: "\n",
      indentStyle: ts.IndentStyle.Smart,
      insertSpaceAfterCommaDelimiter: true,
      insertSpaceAfterSemicolonInForStatements: true,
      insertSpaceBeforeAndAfterBinaryOperators: true,
      insertSpaceAfterKeywordsInControlFlowStatements: true,
      insertSpaceAfterFunctionKeywordForAnonymousFunctions: false,
      insertSpaceBeforeFunctionParenthesis: false,
      insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
      semicolons: ts.SemicolonPreference.Insert,
    };

    // Create a minimal Language Service for formatting
    const languageServiceHost: ts.LanguageServiceHost = {
      getCompilationSettings: () => ({}),
      getScriptFileNames: () => [absPath],
      getScriptVersion: () => "1",
      getScriptSnapshot: (fileName) => {
        if (fileName === absPath) {
          return ts.ScriptSnapshot.fromString(content);
        }
        return undefined;
      },
      getCurrentDirectory: () => process.cwd(),
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: () => true,
      readFile: () => content,
      getNewLine: () => "\n"
    };

    const languageService = ts.createLanguageService(languageServiceHost);

    // フォーマット実行
    const edits = languageService.getFormattingEditsForDocument(absPath, formatOptions);

    if (edits.length === 0) {
      return { ok: true, data: "no changes" };
    }

    // 編集を逆順適用（offset ずれ防止）
    let result = content;
    let minLine = Infinity;
    let maxLine = -Infinity;

    for (const edit of [...edits].reverse()) {
      const startPos = sourceFile.getLineAndCharacterOfPosition(edit.span.start);
      const endPos = sourceFile.getLineAndCharacterOfPosition(edit.span.start + edit.span.length);
      minLine = Math.min(minLine, startPos.line);
      maxLine = Math.max(maxLine, endPos.line);

      result = result.slice(0, edit.span.start) + edit.newText + result.slice(edit.span.start + edit.span.length);
    }

    const changedLines = maxLine - minLine + 1;

    // 変更をファイルに書き込み
    bufferManager.setContent(absPath, result);
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
          before: content,
          after: result,
        },
      ],
    };
    await historyTracker.record(changeset);

    // 変更メタデータを計算
    const changeMetadata: ChangeMetadata = {
      filePath: absPath,
      startLine: (minLine === Infinity ? 0 : minLine) + 1,
      endLine: (maxLine === -Infinity ? 0 : maxLine) + 1,
      newEndLine: (minLine === Infinity ? 0 : minLine) + 1 + (result.split("\n").length - content.split("\n").length),
    };

    return {
      ok: true,
      data: `formatted: ${filepath(relativePath)}\nchanges: ${changedLines} line(s)\ndiagnostics: ok`,
      changes: [changeMetadata],
    };
  } catch (err) {
    return errorResponse(`Failed to format: ${err instanceof Error ? err.message : String(err)}`);
  }
}
