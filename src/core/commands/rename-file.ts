/**
 * rename-file コマンドハンドラ。
 *
 * ファイルをリネームし、プロジェクト内の全 import 参照を更新する。
 */

import { existsSync, renameSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { findImportsTo, type ImportEntry } from "../imports/scanner";
import { rewriteImports, calculateNewSpecifier } from "../imports/rewriter";
import { findProjectRoot } from "../../shared/project";
import { LspManager } from "../../lsp/manager";
import type { HistoryTracker } from "../history/tracker";
import type { Changeset, FileChange } from "../history/types";
import type { IpcRequest, IpcResponse } from "../../shared/types";
import type { DaemonContext } from "../../daemon/registry";
import { filepath, muted } from "../../shared/colors";
import { SessionManager } from "../session/manager";

/**
 * rename-file コマンドのエントリポイント。
 */
export async function handleRenameFile(
  request: IpcRequest,
  ctx: DaemonContext
): Promise<IpcResponse> {
  const { args } = request;
  const oldPath = args.file as string | undefined;
  const newPath = args.to as string | undefined;

  if (!oldPath || !newPath) {
    return { ok: false, error: "Missing required args: file, to" };
  }

  const oldAbsPath = resolve(oldPath);
  const newAbsPath = resolve(newPath);

  // 1. oldPath の存在確認
  if (!existsSync(oldAbsPath)) {
    return { ok: false, error: `File not found: ${oldAbsPath}` };
  }

  // 2. newPath の親ディレクトリを作成
  const newDir = dirname(newAbsPath);
  try {
    mkdirSync(newDir, { recursive: true });
  } catch (err) {
    return {
      ok: false,
      error: `Failed to create directory: ${newDir}`,
    };
  }

  // 3. newPath が既に存在する場合はエラー
  if (existsSync(newAbsPath)) {
    return { ok: false, error: `Destination already exists: ${newAbsPath}` };
  }

  // 4. プロジェクトルート取得
  const projectRoot = findProjectRoot(oldAbsPath);
  const chainId = await SessionManager.resolveChainId(projectRoot, request.tag);
  const historyTracker = ctx.getHistoryTracker(projectRoot, chainId);

  // 5. 参照元を収集
  const importEntries = await findImportsTo(projectRoot, oldAbsPath);

  // 6. 各参照元ファイルの変更前内容を保存
  const fileChanges: FileChange[] = [];
  const beforeContents = new Map<string, string>();

  for (const entry of importEntries) {
    if (!beforeContents.has(entry.filePath)) {
      const before = ctx.bufferManager.getContent(entry.filePath);
      beforeContents.set(entry.filePath, before);
    }
  }

  // 旧ファイル自身の内容も保存（リネーム前）
  const oldFileContent = ctx.bufferManager.getContent(oldAbsPath);

  // 6.5. リネーム前に旧ファイルの import を抽出（重要: リネーム前に実行）
  const oldFileImports = await extractSelfImports(oldAbsPath, projectRoot, ctx.bufferManager);

  // 7. oldPath を newPath にリネーム
  try {
    renameSync(oldAbsPath, newAbsPath);
  } catch (err) {
    return {
      ok: false,
      error: `Failed to rename file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 8. 各参照元ファイルの import 指定子を書き換え
  // ファイル単位でグループ化（同一ファイルへの重複処理を防止）
  const fileGroups = new Map<string, ImportEntry[]>();
  for (const entry of importEntries) {
    if (!fileGroups.has(entry.filePath)) {
      fileGroups.set(entry.filePath, []);
    }
    fileGroups.get(entry.filePath)!.push(entry);
  }

  const updatedFiles: string[] = [];

  // ファイル単位で処理
  for (const [filePath, entries] of fileGroups) {
    const before = beforeContents.get(filePath)!;
    let currentContent = before;
    let totalEditCount = 0;

    // 同一ファイル内の全指定子を順次書き換え
    for (const entry of entries) {
      const newSpecifier = calculateNewSpecifier(
        filePath,
        oldAbsPath,
        newAbsPath,
        entry.specifier
      );

      const rewriteResult = rewriteImports(
        filePath,
        currentContent,
        entry.specifier,
        newSpecifier
      );

      currentContent = rewriteResult.newContent;
      totalEditCount += rewriteResult.editCount;
    }

    if (totalEditCount > 0) {
      // ディスクに書き込み（ファイルごとに1回）
      const beforeLength = ctx.bufferManager.getContent(filePath).length;
      ctx.bufferManager.delete(filePath, 0, beforeLength);
      ctx.bufferManager.insert(filePath, 0, currentContent);
      ctx.bufferManager.flush(filePath);

      // FileChange 記録（ファイルごとに1エントリ）
      fileChanges.push({
        filePath,
        before,
        after: currentContent,
      });

      updatedFiles.push(filePath);
    }
  }

  // 9. リネームされたファイル自身の import 更新
  if (oldFileImports.length > 0) {
    let newFileContent = ctx.bufferManager.getContent(newAbsPath);
    let selfEditCount = 0;

    for (const imp of oldFileImports) {
      const newSpecifier = calculateNewSpecifier(
        newAbsPath,
        imp.resolvedPath,
        imp.resolvedPath,
        imp.specifier
      );

      if (newSpecifier !== imp.specifier) {
        const rewriteResult = rewriteImports(
          newAbsPath,
          newFileContent,
          imp.specifier,
          newSpecifier
        );

        newFileContent = rewriteResult.newContent;
        selfEditCount += rewriteResult.editCount;
      }
    }

    if (selfEditCount > 0) {
      const contentLength = ctx.bufferManager.getContent(newAbsPath).length;
      ctx.bufferManager.delete(newAbsPath, 0, contentLength);
      ctx.bufferManager.insert(newAbsPath, 0, newFileContent);
      ctx.bufferManager.flush(newAbsPath);

      // B3: ファイル移動の Changeset 記録（特殊形式）
      // 旧パス: before=旧内容, after=""（消失）
      fileChanges.push({
        filePath: oldAbsPath,
        before: oldFileContent,
        after: "",
      });

      // 新パス: before=""（出現）, after=新内容
      fileChanges.push({
        filePath: newAbsPath,
        before: "",
        after: newFileContent,
      });
    } else {
      // 自身の import 更新がない場合もファイル移動を記録
      fileChanges.push({
        filePath: oldAbsPath,
        before: oldFileContent,
        after: "",
      });

      fileChanges.push({
        filePath: newAbsPath,
        before: "",
        after: oldFileContent,
      });
    }
  } else {
    // 自身に import がない場合
    fileChanges.push({
      filePath: oldAbsPath,
      before: oldFileContent,
      after: "",
    });

    fileChanges.push({
      filePath: newAbsPath,
      before: "",
      after: oldFileContent,
    });
  }

  // 10. Changeset 記録
  const changeset: Changeset = {
    id: String(Date.now()),
    timestamp: new Date().toISOString(),
    command: "rename-file",
    description: `${oldAbsPath} → ${newAbsPath}`,
    changes: fileChanges,
  };

  await historyTracker.record(changeset);

  // 11. LSP 状態リセット
  const client = await ctx.lspManager.getClient(newAbsPath, projectRoot);
  if (client) {
    // 変更されたファイルの didClose
    for (const filePath of updatedFiles) {
      const uri = `file://${filePath}`;
      client.closeDocument(uri);
    }

    // リネームされたファイル自身
    const oldUri = `file://${oldAbsPath}`;
    const newUri = `file://${newAbsPath}`;
    client.closeDocument(oldUri);
    client.closeDocument(newUri);
  }

  // 12. サマリ返却
  const output = formatOutput(oldAbsPath, newAbsPath, importEntries.length, updatedFiles);
  return { ok: true, data: output };
}

/**
 * リネームされたファイル自身の import を抽出する。
 */
async function extractSelfImports(
  filePath: string,
  projectRoot: string,
  bufferManager: import("../buffer/manager").BufferManager
): Promise<Array<{ specifier: string; resolvedPath: string }>> {
  const content = bufferManager.getContent(filePath);
  const lines = content.split("\n");
  const results: Array<{ specifier: string; resolvedPath: string }> = [];

  // scanner.ts の extractImports と同じロジック
  const patterns = [
    /^\s*import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*]+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/,
    /^\s*import\s+['"]([^'"]+)['"]/,
    /^\s*export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/,
    /^\s*(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  ];

  for (const line of lines) {
    if (!line) continue;

    for (const pattern of patterns) {
      const match = pattern.exec(line);
      if (match && match[1]) {
        const specifier = match[1];
        if (!specifier.startsWith(".")) continue;

        // 簡易的な解決（scanner.ts の resolveModuleSpecifier と同等）
        const { resolveModuleSpecifier } = await import("../imports/scanner");
        const resolved = resolveModuleSpecifier(specifier, filePath, projectRoot);
        if (resolved) {
          results.push({ specifier, resolvedPath: resolved });
        }
        break;
      }
    }
  }

  return results;
}

/**
 * 出力フォーマット。
 */
function formatOutput(
  oldPath: string,
  newPath: string,
  importCount: number,
  updatedFiles: string[]
): string {
  const lines = [
    `renamed: ${filepath(oldPath)} → ${filepath(newPath)}`,
    `engine: static`,
    `imports updated: ${importCount}`,
  ];

  if (updatedFiles.length > 0) {
    lines.push("");
    for (const file of updatedFiles) {
      lines.push(muted(`--- ${filepath(file)} (1 edit) ---`));
    }
  }

  return lines.join("\n");
}

// scanner.ts の関数をエクスポート（extractSelfImportsで使用）
async function resolveModuleSpecifier(
  specifier: string,
  fromFile: string,
  projectRoot: string
): Promise<string | null> {
  const { resolveModuleSpecifier: resolve } = await import("../imports/scanner");
  return resolve(specifier, fromFile, projectRoot);
}
