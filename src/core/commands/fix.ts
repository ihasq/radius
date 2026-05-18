/**
 * Phase 17: fix コマンドハンドラ。
 *
 * LSPのコードアクションを適用する。
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
import { collectAndFormatWithTracking } from "../../lsp/diagnostics";
import type { DiagnosticRegistry } from "../../lsp/diagnostic-registry";
import { filepath, marker as colorMarker } from "../../shared/colors";
import type { LspCodeAction, LspRange, LspTextEdit, LspWorkspaceEdit } from "../../lsp/types";

/**
 * fix コマンドハンドラ。
 */
export async function handleFix(
  args: Record<string, unknown>,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
  bufferManager: BufferManager,
  diagnosticRegistry: DiagnosticRegistry
): Promise<IpcResponse> {
  const file = args.file as string | undefined;
  const list = args.list as boolean | undefined;
  const line = args.line as number | string | undefined;
  const id = args.id as string | undefined;

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
    return { ok: true, data: "code actions unavailable (no LSP for this file type)" };
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

  const lines = content.split("\n");
  const languageId = resolveLanguageId(absPath);

  // ドキュメントを開く
  client.openDocument(uri, languageId, content);
  // Trigger diagnostic calculation by notifying change
  client.changeDocument(uri, content, 2);

  // 診断情報を待つ（TypeScript LSP は初期化に時間がかかる場合がある）
  await new Promise(resolve => setTimeout(resolve, 1500));

  try {
    // 行範囲を決定
    let range: LspRange;
    if (line !== undefined) {
      const lineNum = typeof line === "string" ? parseInt(line, 10) - 1 : line - 1;
      range = {
        start: { line: lineNum, character: 0 },
        end: { line: lineNum, character: lines[lineNum]?.length || 0 }
      };
    } else {
      range = {
        start: { line: 0, character: 0 },
        end: { line: lines.length - 1, character: lines[lines.length - 1]?.length || 0 }
      };
    }

    // 診断情報を取得
    const diagnostics = client.getDiagnostics(uri);

    // コードアクションを取得
    const actions = await client.codeAction(uri, range, diagnostics);

    // --list モード
    if (list) {
      client.closeDocument(uri);

      if (actions.length === 0) {
        return { ok: true, data: "no code actions available" };
      }

      const relativePath = relative(projectRoot, absPath);
      const output: string[] = [`code actions for ${relativePath}:`, ""];

      actions.forEach((action, i) => {
        const lineInfo = action.diagnostics?.[0]?.range?.start?.line !== undefined
          ? ` (line ${action.diagnostics[0].range.start.line + 1})`
          : "";
        output.push(`  [${i + 1}] ${action.title}${lineInfo}`);
        if (action.kind) {
          output.push(`      source: ${action.kind}`);
        }
      });

      output.push("", `${actions.length} action(s) available`);

      return { ok: true, data: output.join("\n") };
    }

    // 適用モード
    if (actions.length === 0) {
      client.closeDocument(uri);
      return { ok: true, data: "no code actions available" };
    }

    // アクションを選択
    let selectedAction: LspCodeAction;
    if (id !== undefined) {
      const idx = parseInt(id, 10) - 1;
      if (idx < 0 || idx >= actions.length) {
        client.closeDocument(uri);
        return { ok: false, error: `Invalid action id: ${id}` };
      }
      selectedAction = actions[idx];
    } else {
      selectedAction = actions[0];
    }

    // アクションに適用可能な編集がない場合は早期リターン
    if (!selectedAction.edit && !selectedAction.command) {
      client.closeDocument(uri);
      return { ok: true, data: `no applicable edit for action: ${selectedAction.title}` };
    }

    // WorkspaceEdit を適用
    const originalContent = content;
    let changeMetadata: ChangeMetadata | null = null;

    if (selectedAction.edit) {
      const editResult = await applyWorkspaceEdit(
        selectedAction.edit,
        absPath,
        bufferManager
      );

      if (!editResult.ok) {
        client.closeDocument(uri);
        return { ok: false, error: editResult.error! };
      }

      changeMetadata = editResult.metadata ?? null;
    } else if (selectedAction.command) {
      // コマンド実行
      try {
        await client.executeCommand(
          selectedAction.command.command,
          selectedAction.command.arguments
        );
      } catch (err) {
        client.closeDocument(uri);
        return { ok: false, error: `Failed to execute command: ${err}` };
      }
    }

    // 変更後の内容を取得
    const newContent = bufferManager.getContent(absPath);

    // Changeset 記録
    if (originalContent !== newContent) {
      const changeset: Changeset = {
        id: String(Date.now()),
        timestamp: new Date().toISOString(),
        command: "fix",
        description: `${absPath}: ${selectedAction.title}`,
        changes: [
          {
            filePath: absPath,
            before: originalContent,
            after: newContent,
          },
        ],
      };
      await historyTracker.record(changeset);
    }

    // 診断情報を再取得（ID付与・差分検出）
    client.changeDocument(uri, newContent);
    await new Promise(resolve => setTimeout(resolve, 300));

    const diagnosticsOutput = await collectAndFormatWithTracking(
      lspManager,
      diagnosticRegistry,
      absPath,
      newContent
    );

    client.closeDocument(uri);

    // 出力
    const relativePath = relative(projectRoot, absPath);
    const context = generateChangeContext(newContent, changeMetadata);

    return {
      ok: true,
      data: `applied: ${selectedAction.title}\nfile: ${filepath(relativePath)}\n\n${context}${diagnosticsOutput}`,
      changes: changeMetadata ? [changeMetadata] : undefined,
    };
  } catch (err) {
    client.closeDocument(uri);
    throw err;
  }
}

/**
 * WorkspaceEdit を適用する。
 */
async function applyWorkspaceEdit(
  edit: LspWorkspaceEdit,
  targetPath: string,
  bufferManager: BufferManager
): Promise<{ ok: boolean; error?: string; metadata?: ChangeMetadata }> {
  const edits: LspTextEdit[] = [];
  const targetUri = `file://${targetPath}`;

  // changes または documentChanges から編集を収集
  if (edit.changes) {
    const uriEdits = edit.changes[targetUri];
    if (uriEdits) {
      edits.push(...uriEdits);
    }
  }

  if (edit.documentChanges) {
    for (const docEdit of edit.documentChanges) {
      if (docEdit.textDocument.uri === targetUri) {
        edits.push(...docEdit.edits);
      }
    }
  }

  if (edits.length === 0) {
    return { ok: true };
  }

  // 編集を逆順にソート（末尾から適用）
  edits.sort((a, b) => {
    const lineDiff = b.range.start.line - a.range.start.line;
    if (lineDiff !== 0) return lineDiff;
    return b.range.start.character - a.range.start.character;
  });

  try {
    const content = bufferManager.getContent(targetPath);
    const lines = content.split("\n");

    // 変更メタデータの範囲を計算
    let minLine = Infinity;
    let maxLine = -Infinity;

    for (const e of edits) {
      minLine = Math.min(minLine, e.range.start.line);
      maxLine = Math.max(maxLine, e.range.end.line);

      // オフセットを計算
      const startOffset = getOffset(lines, e.range.start.line, e.range.start.character);
      const endOffset = getOffset(lines, e.range.end.line, e.range.end.character);

      // 削除して挿入
      bufferManager.delete(targetPath, startOffset, endOffset - startOffset);
      bufferManager.insert(targetPath, startOffset, e.newText);
    }

    bufferManager.flush(targetPath);

    const newContent = bufferManager.getContent(targetPath);
    const newLines = newContent.split("\n");

    const metadata: ChangeMetadata = {
      filePath: targetPath,
      startLine: minLine + 1,
      endLine: maxLine + 1,
      newEndLine: Math.min(newLines.length, maxLine + 1 + (newLines.length - lines.length)),
    };

    return { ok: true, metadata };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to apply edit: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
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
 * 変更コンテキストを生成する。
 */
function generateChangeContext(content: string, metadata: ChangeMetadata | null): string {
  if (!metadata) {
    return "";
  }

  const lines = content.split("\n");
  const changeLine = metadata.startLine - 1;
  const startLine = Math.max(0, changeLine - 1);
  const endLine = Math.min(lines.length - 1, changeLine + 3);

  const output: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const lineNum = String(i + 1).padStart(4, " ");
    const marker = i === changeLine ? ">" : " ";
    const line = `${marker}${lineNum}: ${lines[i]}`;
    output.push(i === changeLine ? colorMarker(line) : line);
  }

  return output.join("\n");
}

