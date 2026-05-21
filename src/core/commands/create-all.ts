/**
 * create-all コマンドハンドラ。
 *
 * 複数ファイルを一括作成（--- 区切りフォーマット）。
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { HistoryTracker } from "../history/tracker";
import type { Changeset, FileChange } from "../history/types";
import type { IpcResponse } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import { collectAndFormatWithTracking } from "../../lsp/diagnostics";
import type { DiagnosticRegistry } from "../../lsp/diagnostic-registry";
import { filepath } from "../../shared/colors";
import { errorResponse } from "../../shared/output";
import { analyzeFileContext, formatContextSection } from "../../shared/context";

interface FileSpec {
  path: string;
  content: string;
}

/**
 * stdin から --- 区切りの複数ファイル仕様を解析する。
 *
 * フォーマット:
 * --- /path/to/file1.ts
 * content of file1
 * --- /path/to/file2.ts
 * content of file2
 */
function parseMultiFileInput(input: string): FileSpec[] {
  const lines = input.split("\n");
  const specs: FileSpec[] = [];
  let currentPath: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith("--- ")) {
      // 前のファイルを保存
      if (currentPath) {
        specs.push({
          path: currentPath,
          content: currentContent.join("\n"),
        });
      }

      // 新しいファイル開始
      currentPath = line.slice(4).trim();
      currentContent = [];
    } else if (currentPath) {
      currentContent.push(line);
    }
  }

  // 最後のファイルを保存
  if (currentPath) {
    specs.push({
      path: currentPath,
      content: currentContent.join("\n"),
    });
  }

  return specs;
}

/**
 * create-all コマンドハンドラ。
 */
export async function handleCreateAll(
  args: Record<string, unknown>,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
  bufferManager: BufferManager,
  diagnosticRegistry: DiagnosticRegistry
): Promise<IpcResponse> {
  const stdin = args.stdin as string | undefined;
  const force = args.force as boolean | undefined;

  if (!stdin) {
    return errorResponse("create-all requires --stdin input with --- delimited file specs");
  }

  // ファイル仕様を解析
  const specs = parseMultiFileInput(stdin);

  if (specs.length === 0) {
    return errorResponse("No files specified in input");
  }

  // 既存ファイルチェック（--force がない場合）
  if (!force) {
    for (const spec of specs) {
      const absPath = resolve(spec.path);
      if (existsSync(absPath)) {
        return errorResponse(`file already exists: ${absPath}. Use --force to overwrite.`);
      }
    }
  }

  // 全ファイルを作成
  const changes: FileChange[] = [];
  const outputs: string[] = [];

  for (const spec of specs) {
    const absPath = resolve(spec.path);
    const fileExists = existsSync(absPath);

    // 上書き前の内容を記録
    let beforeContent = "";
    if (fileExists) {
      try {
        beforeContent = bufferManager.getContent(absPath);
      } catch {
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

    // ファイル作成または上書き
    try {
      if (fileExists) {
        bufferManager.setContent(absPath, spec.content);
      } else {
        bufferManager.open(absPath);
        if (spec.content) {
          bufferManager.insert(absPath, 0, spec.content);
        }
      }
      bufferManager.flush(absPath);
    } catch (err) {
      return errorResponse(`Failed to create file ${absPath}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Changeset に追加
    changes.push({
      filePath: absPath,
      before: beforeContent,
      after: spec.content,
    });

    // 出力を生成
    const actionWord = force && fileExists ? "overwritten" : "created";
    outputs.push(`${actionWord}: ${filepath(absPath)}`);

    // Diagnostics を収集
    const diagnosticsOutput = await collectAndFormatWithTracking(
      lspManager,
      diagnosticRegistry,
      absPath,
      spec.content
    );
    outputs.push(diagnosticsOutput);

    // Context を収集
    const ctx = analyzeFileContext(absPath, spec.content);
    const contextOutput = ctx ? formatContextSection(ctx) : "";
    if (contextOutput) {
      outputs.push(contextOutput);
    }

    outputs.push(""); // 空行で区切り
  }

  // 1つの changeset として記録
  const changeset: Changeset = {
    id: String(Date.now()),
    timestamp: new Date().toISOString(),
    command: "create-all",
    description: `${specs.length} file(s)`,
    changes,
  };

  await historyTracker.record(changeset);

  const summary = `created ${specs.length} file(s)`;

  return {
    ok: true,
    data: `${summary}\n\n${outputs.join("\n")}`,
  };
}
