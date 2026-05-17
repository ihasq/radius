/**
 * modify-var コマンドハンドラ。
 *
 * LSPの textDocument/rename を使用して変数名を一括変更する。
 * LSP不可の場合はテキストベースの検索置換にフォールバックする。
 */

import { resolve } from "node:path";
import { LspManager, resolveLanguageId } from "../../lsp/manager";
import { findProjectRoot } from "../../shared/project";
import { HistoryTracker } from "../history/tracker";
import type { Changeset, FileChange } from "../history/types";
import type { LspWorkspaceEdit, LspTextEdit } from "../../lsp/types";
import type { IpcResponse } from "../../shared/types";
import type { BufferManager } from "../buffer/manager";
import { collectDiagnostics, formatDiagnostics } from "../../lsp/diagnostics";
import { filepath, added, muted, warning as colorWarning } from "../../shared/colors";

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
  lspManager: LspManager,
  filePath: string,
  projectRoot: string,
  fromName: string,
  toName: string,
  bufferManager: BufferManager
): Promise<Map<string, LspTextEdit[]> | null> {
  const client = await lspManager.getClient(filePath, projectRoot);
  if (!client) return null;

  const content = bufferManager.getContent(filePath);
  const lines = content.split("\n");
  const uri = `file://${filePath}`;
  const languageId = resolveLanguageId(filePath);

  client.openDocument(uri, languageId, content);

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
    if (attempt >= MAX_RETRIES) {
      return null;
    }

    await Bun.sleep(RETRY_INTERVAL_MS);
  }

  return null;
}

/**
 * modify-var コマンドのエントリポイント。
 */
export async function handleModifyVar(
  args: Record<string, unknown>,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
  bufferManager: BufferManager
): Promise<IpcResponse> {
  const filePath = args.file as string | undefined;
  const fromName = args.from as string | undefined;
  const toName = args.to as string | undefined;

  if (!filePath || !fromName || !toName) {
    return { ok: false, error: "Missing required args: file, from, to" };
  }

  const absPath = resolve(filePath);

  // ファイル存在確認
  try {
    bufferManager.getContent(absPath);
  } catch {
    return { ok: false, error: `Cannot read file: ${absPath}` };
  }

  const projectRoot = findProjectRoot(absPath);

  // LSPで試行
  const editsMap = await lspRename(lspManager, absPath, projectRoot, fromName, toName, bufferManager);
  let engine: "lsp" | "text" = "lsp";
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
        return {
          ok: false,
          error: `Failed to write file ${path}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // A2: 変更された各ファイルの didClose を送信
    const client = await lspManager.getClient(absPath, projectRoot);
    if (client) {
      for (const path of editsMap.keys()) {
        const uri = `file://${path}`;
        client.closeDocument(uri);
      }
    }
  } else {
    // テキストフォールバック
    engine = "text";
    // B3: ファイル書き込み前に before 内容を読み取る
    const before = bufferManager.getContent(absPath);
    const fileEdit = textReplace(absPath, fromName, toName, bufferManager);
    if (fileEdit.edits.length === 0) {
      return { ok: false, error: `Variable "${fromName}" not found in ${absPath}` };
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

  // LSP診断情報を収集（全変更ファイル）
  const diagnosticsOutputs: string[] = [];
  for (const change of fileChanges) {
    const diagnosticReport = await collectDiagnostics(lspManager, change.filePath, change.after);
    if (diagnosticReport && diagnosticReport.diagnostics.length > 0) {
      diagnosticsOutputs.push(`\n${filepath(change.filePath)}:\n${formatDiagnostics(diagnosticReport)}`);
    }
  }

  const diagnosticsSection = diagnosticsOutputs.length > 0
    ? `\ndiagnostics:${diagnosticsOutputs.join("\n")}`
    : "\ndiagnostics: ok";

  return { ok: true, data: output + diagnosticsSection };
}

/**
 * LLM向けの出力フォーマット。
 */
function formatOutput(
  fromName: string,
  toName: string,
  engine: "lsp" | "text",
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
