/**
 * modify-var コマンドハンドラ。
 *
 * depth-3: TypeScript ファイルは TsRad (Language Service) でプロジェクト全体のリネームを実行
 * LSPの textDocument/rename を使用して変数名を一括変更する。
 * LSP不可の場合はテキストベースの検索置換にフォールバックする。
 */

import ts from "typescript";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { LspManager } from "../../lsp/manager";
import type { LspClient } from "../../lsp/client";
import { findProjectRoot } from "../../shared/project";
import { HistoryTracker } from "../history/tracker";
import type { Changeset, FileChange } from "../history/types";
import type { LspWorkspaceEdit, LspTextEdit } from "../../lsp/types";
import type { IpcResponse, ChangeMetadata } from "../../shared/types";
import type { BufferManager } from "../buffer/manager";
import { collectAndFormatWithTracking } from "../../lsp/diagnostics";
import type { DiagnosticRegistry } from "../../lsp/diagnostic-registry";
import { filepath, added, muted, warning as colorWarning } from "../../shared/colors";
import { errorResponse } from "../../shared/output";
import type { TsRadManager } from "../ts-service/manager";

/** リトライロジックの定数（read-varと同期） */
const INITIAL_WAIT_MS = 1000;
const RETRY_INTERVAL_MS = 2000;
const MAX_RETRIES = 5;

interface FileEdit {
  path: string;
  edits: Array<{ line: number; newText: string }>;
}

/**
 * WorkspaceEditを正規化して、ファイルパス -> TextEdit[]のマップに変換する。
 */
function normalizeWorkspaceEdit(
  workspaceEdit: LspWorkspaceEdit
): Map<string, LspTextEdit[]> {
  const result = new Map<string, LspTextEdit[]>();

  // changes形式
  if (workspaceEdit.changes) {
    for (const [uri, edits] of Object.entries(workspaceEdit.changes)) {
      const path = uri.replace("file://", "");
      result.set(path, edits);
    }
  }

  // documentChanges形式
  if (workspaceEdit.documentChanges) {
    for (const docEdit of workspaceEdit.documentChanges) {
      const path = docEdit.textDocument.uri.replace("file://", "");
      const existing = result.get(path) || [];
      result.set(path, [...existing, ...docEdit.edits]);
    }
  }

  return result;
}

/**
 * TextEditを行番号の降順でソートし、BufferManager経由でファイルに適用する。
 */
function applyEditsToFile(filePath: string, edits: LspTextEdit[], bufferManager: BufferManager): FileEdit {
  // 行番号の降順でソート（後ろから適用）
  const sortedEdits = [...edits].sort(
    (a, b) => b.range.start.line - a.range.start.line
  );

  const appliedEdits: Array<{ line: number; newText: string }> = [];

  // BufferManager経由で編集を適用
  for (const edit of sortedEdits) {
    const startLine = edit.range.start.line + 1; // 1-indexed
    const endLine = edit.range.end.line + 1;
    const startChar = edit.range.start.character + 1;
    const endChar = edit.range.end.character + 1;

    // 開始オフセットと長さを計算
    const startOffset = bufferManager.getOffsetAt(filePath, startLine, startChar);
    const endOffset = bufferManager.getOffsetAt(filePath, endLine, endChar);
    const length = endOffset - startOffset;

    // 削除して挿入
    bufferManager.delete(filePath, startOffset, length);
    bufferManager.insert(filePath, startOffset, edit.newText);

    // 編集後の行内容を取得（表示用）
    const newLineContent = bufferManager.getLineContent(filePath, startLine);
    appliedEdits.push({ line: startLine, newText: newLineContent });
  }

  bufferManager.flush(filePath);

  return { path: filePath, edits: appliedEdits.reverse() };
}

/**
 * テキストベースのフォールバック。単一ファイルのみ対象。
 */
function textReplace(
  filePath: string,
  fromName: string,
  toName: string,
  bufferManager: BufferManager
): FileEdit {
  const content = bufferManager.getContent(filePath);
  const lines = content.split("\n");

  const pattern = new RegExp(`\\b${escapeRegex(fromName)}\\b`, "g");
  const appliedEdits: Array<{ line: number; newText: string }> = [];

  // 後ろから適用するため、マッチ位置を収集
  interface Match {
    lineIndex: number;
    startChar: number;
  }
  const matches: Match[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        matches.push({ lineIndex: i, startChar: match.index });
      }
    }
    pattern.lastIndex = 0;
  }

  if (matches.length === 0) {
    return { path: filePath, edits: [] };
  }

  // 後ろから適用（降順ソート）
  matches.sort((a, b) => {
    if (a.lineIndex !== b.lineIndex) return b.lineIndex - a.lineIndex;
    return b.startChar - a.startChar;
  });

  for (const match of matches) {
    const lineNum = match.lineIndex + 1; // 1-indexed
    const startChar = match.startChar + 1; // 1-indexed

    const offset = bufferManager.getOffsetAt(filePath, lineNum, startChar);
    bufferManager.delete(filePath, offset, fromName.length);
    bufferManager.insert(filePath, offset, toName);
  }

  bufferManager.flush(filePath);

  // 編集後の行内容を取得（表示用）
  const seenLines = new Set<number>();
  for (const match of matches) {
    const lineNum = match.lineIndex + 1;
    if (!seenLines.has(lineNum)) {
      seenLines.add(lineNum);
      const newLineContent = bufferManager.getLineContent(filePath, lineNum);
      appliedEdits.push({ line: lineNum, newText: newLineContent });
    }
  }

  // 行番号順にソート
  appliedEdits.sort((a, b) => a.line - b.line);

  return { path: filePath, edits: appliedEdits };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * LSPを使用したリネーム処理。
 */
async function lspRename(
  client: LspClient | null,
  filePath: string,
  fromName: string,
  toName: string,
  bufferManager: BufferManager
): Promise<Map<string, LspTextEdit[]> | null> {
  if (!client) return null;

  const content = bufferManager.getContent(filePath);
  const lines = content.split("\n");
  const uri = `file://${filePath}`;

  // 変数名の位置を特定
  const pattern = new RegExp(`\\b${escapeRegex(fromName)}\\b`);
  let anchorLine = -1;
  let anchorChar = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = pattern.exec(lines[i]);
    if (match) {
      anchorLine = i;
      anchorChar = match.index;
      break;
    }
  }

  if (anchorLine === -1) return null;

  // リトライロジック
  await Bun.sleep(INITIAL_WAIT_MS);
  let attempt = 0;
  let workspaceEdit: LspWorkspaceEdit | null = null;

  while (attempt < MAX_RETRIES) {
    if (!client.isAlive) return null;

    try {
      workspaceEdit = await client.rename(uri, {
        line: anchorLine,
        character: anchorChar,
      }, toName);

      // 有効なレスポンスを得られた場合
      const normalized = normalizeWorkspaceEdit(workspaceEdit);
      if (normalized.size > 0) {
        let hasEdits = false;
        for (const edits of normalized.values()) {
          if (edits.length > 0) {
            hasEdits = true;
            break;
          }
        }
        if (hasEdits) {
          return normalized;
        }
      }
    } catch {
      // リクエスト失敗
    }

    attempt++;
    if (attempt >= MAX_RETRIES) return null;

    await Bun.sleep(RETRY_INTERVAL_MS);
  }

  return null;
}

/**
 * TsRad (depth-3) を使用したリネーム処理。
 * プロジェクト全体のリネームを実行する。
 */
function tsRadRename(
  filePath: string,
  projectRoot: string,
  fromName: string,
  toName: string,
  bufferManager: BufferManager,
  tsRadManager: TsRadManager
): Map<string, LspTextEdit[]> | null {
  try {
    const content = bufferManager.getContent(filePath);
    const lines = content.split("\n");

    // ファイル内容を最新に更新（キャッシュされたLanguage Serviceが古い状態を持つ場合の対策）
    tsRadManager.notifyFileChange(projectRoot, filePath, content);

    // TsRadManager から Language Service を取得
    const service = tsRadManager.getService(projectRoot, 3);

    // 変数名の位置を特定
    const pattern = new RegExp(`\\b${escapeRegex(fromName)}\\b`);
    let anchorLine = -1;
    let anchorChar = -1;
    for (let i = 0; i < lines.length; i++) {
      const match = pattern.exec(lines[i]);
      if (match) {
        anchorLine = i;
        anchorChar = match.index;
        break;
      }
    }

    if (anchorLine === -1) {
      return null;
    }

    // ファイル内の位置を計算
    let offset = 0;
    for (let i = 0; i < anchorLine; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    offset += anchorChar;

    // findRenameLocations を呼び出し
    const locations = service.findRenameLocations(
      filePath,
      offset,
      false, // findInStrings
      false, // findInComments
      false  // providePrefixAndSuffixTextForRename
    );

    if (!locations || locations.length === 0) {
      return null;
    }

    // 結果を LspTextEdit 形式に変換
    const editsMap = new Map<string, LspTextEdit[]>();

    for (const loc of locations) {
      const locFile = loc.fileName;

      // ファイル内容を取得
      let locContent: string;
      try {
        locContent = bufferManager.getContent(locFile);
      } catch {
        try {
          locContent = readFileSync(locFile, "utf-8");
        } catch {
          continue;
        }
      }

      const locLines = locContent.split("\n");

      // offset から行番号と文字位置を計算
      let currentOffset = 0;
      let lineIdx = 0;
      let charIdx = 0;
      for (let i = 0; i < locLines.length; i++) {
        if (currentOffset + locLines[i].length >= loc.textSpan.start) {
          lineIdx = i;
          charIdx = loc.textSpan.start - currentOffset;
          break;
        }
        currentOffset += locLines[i].length + 1;
      }

      const edit: LspTextEdit = {
        range: {
          start: { line: lineIdx, character: charIdx },
          end: { line: lineIdx, character: charIdx + loc.textSpan.length },
        },
        newText: toName,
      };

      const existing = editsMap.get(locFile) || [];
      existing.push(edit);
      editsMap.set(locFile, existing);
    }

    return editsMap.size > 0 ? editsMap : null;
  } catch {
    return null;
  }
}

/**
 * modify-var コマンドのエントリポイント。
 */
export async function handleModifyVar(
  args: Record<string, unknown>,
  lspClient: LspClient | null,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
  bufferManager: BufferManager,
  diagnosticRegistry: DiagnosticRegistry,
  tsRadManager: TsRadManager
): Promise<IpcResponse> {
  const filePath = args.file as string | undefined;
  const fromName = args.from as string | undefined;
  const toName = args.to as string | undefined;

  if (!filePath || !fromName || !toName) {
    return errorResponse("Missing required args: file, from, to");
  }

  const absPath = resolve(filePath);

  // ファイル存在確認
  try {
    bufferManager.getContent(absPath);
  } catch {
    return errorResponse(`Cannot read file: ${absPath}`);
  }

  const projectRoot = findProjectRoot(absPath);

  // TypeScript ファイルの場合は TsRad (depth-3) を優先
  const isTypeScript = absPath.endsWith(".ts") || absPath.endsWith(".tsx");
  let editsMap: Map<string, LspTextEdit[]> | null = null;
  let engine: "ts-rad" | "lsp" | "text" = "lsp";

  if (isTypeScript) {
    editsMap = tsRadRename(absPath, projectRoot, fromName, toName, bufferManager, tsRadManager);
    if (editsMap && editsMap.size > 0) {
      engine = "ts-rad";
    }
  }

  // TsRad 失敗時は LSP で試行
  if (!editsMap || editsMap.size === 0) {
    editsMap = await lspRename(lspClient, absPath, fromName, toName, bufferManager);
    engine = "lsp";
  }

  const fileEdits: FileEdit[] = [];
  const fileChanges: FileChange[] = [];

  if (editsMap && editsMap.size > 0) {
    // LSP成功
    // B3: ファイル書き込み前に before 内容を読み取る
    for (const [path, edits] of editsMap.entries()) {
      try {
        const before = bufferManager.getContent(path);
        const fileEdit = applyEditsToFile(path, edits, bufferManager);
        const after = bufferManager.getContent(path);

        fileEdits.push(fileEdit);
        fileChanges.push({ filePath: path, before, after });
      } catch (err) {
        return errorResponse(`Failed to write file ${path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

  } else {
    // テキストフォールバック
    engine = "text";
    // B3: ファイル書き込み前に before 内容を読み取る
    const before = bufferManager.getContent(absPath);
    const fileEdit = textReplace(absPath, fromName, toName, bufferManager);
    if (fileEdit.edits.length === 0) {
      return errorResponse(`Variable "${fromName}" not found in ${absPath}`);
    }
    const after = bufferManager.getContent(absPath);

    fileEdits.push(fileEdit);
    fileChanges.push({ filePath: absPath, before, after });
  }

  // B3: Changeset を記録
  const changeset: Changeset = {
    id: String(Date.now()),
    timestamp: new Date().toISOString(),
    command: "modify-var",
    description: `${fromName} → ${toName}`,
    changes: fileChanges,
  };
  await historyTracker.record(changeset);

  // 出力フォーマット（A3: テキストフォールバック時の警告追加）
  const output = formatOutput(fromName, toName, engine, fileEdits);

  // LSP診断情報を収集（全変更ファイル、ID付与・差分検出）
  const diagnosticsOutputs: string[] = [];
  for (const change of fileChanges) {
    const diagnosticsOutput = await collectAndFormatWithTracking(
      lspManager,
      diagnosticRegistry,
      change.filePath,
      change.after
    );
    if (!diagnosticsOutput.includes("diagnostics: ok")) {
      diagnosticsOutputs.push(`\n${filepath(change.filePath)}:\n${diagnosticsOutput}`);
    }
  }

  const diagnosticsSection = diagnosticsOutputs.length > 0
    ? `\ndiagnostics:${diagnosticsOutputs.join("\n")}`
    : "\ndiagnostics: ok";

  // ChangeMetadata を構築
  const changeMetadata = fileChanges.map(change => {
    const beforeLines = change.before.split("\n").length;
    const afterLines = change.after.split("\n").length;
    return {
      filePath: change.filePath,
      startLine: 1,
      endLine: beforeLines,
      newEndLine: afterLines
    };
  });

  return { ok: true, data: output + diagnosticsSection, changes: changeMetadata };
}

/**
 * LLM向けの出力フォーマット。
 */
function formatOutput(
  fromName: string,
  toName: string,
  engine: "ts-rad" | "lsp" | "text",
  fileEdits: FileEdit[]
): string {
  const header = [
    `renamed: ${fromName} → ${toName}`,
    `engine: ${engine}`,
    `files modified: ${fileEdits.length}`,
  ].join("\n");

  const body = fileEdits
    .map((fileEdit) => {
      const lines = fileEdit.edits
        .map((edit) => added(`${String(edit.line).padStart(4, " ")}: ${edit.newText}`))
        .join("\n");
      const separator = muted(`--- ${filepath(fileEdit.path)} (${fileEdit.edits.length} edits) ---`);
      return `\n${separator}\n${lines}`;
    })
    .join("\n");

  // A3: テキストフォールバック時の警告
  const warningText = engine === "text"
    ? "\n\n" + colorWarning("warning: text-based replacement was used. Semantic accuracy is not guaranteed. Review changes carefully.")
    : "";

  return header + "\n" + body + warningText;
}
