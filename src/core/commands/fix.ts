/**
 * Phase 17: fix コマンドハンドラ。
 *
 * LSPのコードアクションを適用する。
 */

import { existsSync } from "node:fs";
import { resolve, relative, join } from "node:path";
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
import { formatContext, errorResponse } from "../../shared/output";
import type { LspCodeAction, LspRange, LspTextEdit, LspTextDocumentEdit, LspWorkspaceEdit } from "../../lsp/types";
import type { TsRadManager } from "../ts-service/manager";
import ts from "typescript";

/**
 * ts-rad を使用してコードアクションを取得する。
 */
async function getTsRadCodeActions(
  filePath: string,
  projectRoot: string,
  line: number | string | undefined,
  lines: string[],
  tsRadManager: TsRadManager
): Promise<LspCodeAction[] | null> {
  const tsconfigPath = join(projectRoot, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    return null;
  }

  try {
    const service = tsRadManager.getService(projectRoot, 3);

    try {
      // 診断情報を取得
      const syntactic = service.getSyntacticDiagnostics(filePath);
      const semantic = service.getSemanticDiagnostics(filePath);
      const suggestion = service.getSuggestionDiagnostics(filePath);
      const allDiagnostics = [...syntactic, ...semantic, ...suggestion];

      // 行指定がある場合はフィルタ
      let targetDiagnostics = allDiagnostics;
      if (line !== undefined) {
        const lineNum = typeof line === "string" ? parseInt(line, 10) - 1 : (line as number) - 1;
        targetDiagnostics = allDiagnostics.filter(d => {
          if (d.file && d.start !== undefined) {
            const pos = d.file.getLineAndCharacterOfPosition(d.start);
            return pos.line === lineNum;
          }
          return false;
        });
      }

      // 各診断に対してコードフィックスを取得
      const actions: LspCodeAction[] = [];
      const seenTitles = new Set<string>();

      for (const diag of targetDiagnostics) {
        if (diag.start === undefined || diag.length === undefined) continue;

        const fixes = service.getCodeFixesAtPosition(
          filePath,
          diag.start,
          diag.start + diag.length,
          [diag.code as number],
          {},
          {}
        );

        for (const fix of fixes) {
          // 重複を避ける
          if (seenTitles.has(fix.description)) continue;
          seenTitles.add(fix.description);

          // TypeScript CodeFixAction を LSP CodeAction に変換
          const lspAction: LspCodeAction = {
            title: fix.description,
            kind: "quickfix",
            edit: convertTsChangesToWorkspaceEdit(fix.changes, filePath),
            diagnostics: [{
              range: {
                start: {
                  line: diag.file!.getLineAndCharacterOfPosition(diag.start!).line,
                  character: diag.file!.getLineAndCharacterOfPosition(diag.start!).character
                },
                end: {
                  line: diag.file!.getLineAndCharacterOfPosition(diag.start! + diag.length!).line,
                  character: diag.file!.getLineAndCharacterOfPosition(diag.start! + diag.length!).character
                }
              },
              severity: 1,
              message: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
              source: "ts-rad"
            }]
          };

          actions.push(lspAction);
        }
      }

      return actions;
    } catch (err) {
      // エラー時は null を返す（呼び出し元で処理）
      return null;
    }
  } catch (err) {
    return null;
  }
}

/**
 * TypeScript の FileTextChanges を LSP WorkspaceEdit に変換する。
 */
function convertTsChangesToWorkspaceEdit(
  changes: readonly ts.FileTextChanges[],
  filePath: string
): LspWorkspaceEdit {
  const documentChanges: LspTextDocumentEdit[] = [];

  for (const fileChange of changes) {
    const edits: LspTextEdit[] = [];

    // ファイルを読み込んで SourceFile を作成
    let sourceFile: ts.SourceFile;
    try {
      const fileContent = require("node:fs").readFileSync(fileChange.fileName, "utf-8");
      sourceFile = ts.createSourceFile(
        fileChange.fileName,
        fileContent,
        ts.ScriptTarget.Latest,
        true
      );
    } catch {
      // ファイル読み込み失敗時はスキップ
      continue;
    }

    for (const textChange of fileChange.textChanges) {
      const start = sourceFile.getLineAndCharacterOfPosition(textChange.span.start);
      const end = sourceFile.getLineAndCharacterOfPosition(textChange.span.start + textChange.span.length);

      edits.push({
        range: {
          start: { line: start.line, character: start.character },
          end: { line: end.line, character: end.character }
        },
        newText: textChange.newText
      });
    }

    documentChanges.push({
      textDocument: { uri: `file://${fileChange.fileName}`, version: null },
      edits
    });
  }

  return { documentChanges };
}

/**
 * fix コマンドハンドラ。
 */
export async function handleFix(
  args: Record<string, unknown>,
  lspClient: LspClient | null,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
  bufferManager: BufferManager,
  diagnosticRegistry: DiagnosticRegistry,
  tsRadManager: TsRadManager
): Promise<IpcResponse> {
  const file = args.file as string | undefined;
  const list = args.list as boolean | undefined;
  const line = args.line as number | string | undefined;
  const id = args.id as string | undefined;

  if (!file) {
    return errorResponse("Missing required arg: file");
  }

  const absPath = resolve(file);

  if (!existsSync(absPath)) {
    return errorResponse(`File not found: ${absPath}`);
  }

  const projectRoot = findProjectRoot(absPath);
  const uri = `file://${absPath}`;

  // ファイル内容を取得
  let content: string;
  try {
    content = bufferManager.getContent(absPath);
  } catch (err) {
    return errorResponse(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
  }

  const lines = content.split("\n");

  // TypeScript/JavaScript ファイルは ts-rad でコードアクション取得
  const ext = absPath.split(".").pop()?.toLowerCase();
  const isTypeScript = ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx";

  let actions: LspCodeAction[];

  if (isTypeScript) {
    // ts-rad を使用
    const tsRadActions = await getTsRadCodeActions(absPath, projectRoot, line, lines, tsRadManager);
    if (tsRadActions === null) {
      return { ok: true, data: "code actions unavailable (ts-rad initialization failed)" };
    }
    actions = tsRadActions;
  } else {
    // LSPクライアントを使用
    const client = lspClient;
    if (!client) {
      return { ok: true, data: "code actions unavailable (no LSP for this file type)" };
    }

    // 診断情報を待つ
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
      actions = await client.codeAction(uri, range, diagnostics);
    } catch (err) {
      return errorResponse(`Failed to get code actions: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {

    // --list モード
    if (list) {
      if (actions.length === 0) {
        // 非TypeScriptファイルでアクションが0の場合は未サポート扱い
        if (!isTypeScript) {
          return { ok: true, data: "code actions unavailable (no LSP for this file type)" };
        }
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
      // 非TypeScriptファイルでアクションが0の場合は未サポート扱い
      if (!isTypeScript) {
        return { ok: true, data: "code actions unavailable (no LSP for this file type)" };
      }
      return { ok: true, data: "no code actions available" };
    }

    // アクションを選択
    let selectedAction: LspCodeAction;
    if (id !== undefined) {
      const idx = parseInt(id, 10) - 1;
      if (idx < 0 || idx >= actions.length) {
        return errorResponse(`Invalid action id: ${id}`);
      }
      selectedAction = actions[idx];
    } else {
      selectedAction = actions[0];
    }

    // アクションに適用可能な編集がない場合は早期リターン
    if (!selectedAction.edit && !selectedAction.command) {
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
        return errorResponse(editResult.error!);
      }

      changeMetadata = editResult.metadata ?? null;
    } else if (selectedAction.command) {
      // コマンド実行（LSPのみ）
      if (!isTypeScript) {
        const client = lspClient;
        if (!client) {
          return errorResponse("Command execution requires LSP client");
        }
        try {
          await client.executeCommand(
            selectedAction.command.command,
            selectedAction.command.arguments
          );
        } catch (err) {
          return errorResponse(`Failed to execute command: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        // ts-rad はコマンド実行をサポートしない
        return { ok: true, data: `no applicable edit for action: ${selectedAction.title}` };
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
    if (!isTypeScript && lspClient) {
      lspClient.changeDocument(uri, newContent);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const diagnosticsOutput = await collectAndFormatWithTracking(
      lspManager,
      diagnosticRegistry,
      absPath,
      newContent,
      tsRadManager
    );

    // 出力
    const relativePath = relative(projectRoot, absPath);
    const context = changeMetadata
      ? formatContext({ lines: newContent.split("\n"), highlightLines: [changeMetadata.startLine - 1] })
      : "";

    return {
      ok: true,
      data: `applied: ${selectedAction.title}\nfile: ${filepath(relativePath)}\n\n${context}${diagnosticsOutput}`,
      changes: changeMetadata ? [changeMetadata] : undefined,
    };
  } catch (err) {
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


