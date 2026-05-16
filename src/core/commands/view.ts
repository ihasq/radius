/**
 * view コマンドハンドラ。
 *
 * ファイル内容の閲覧（行範囲指定可）、ディレクトリ一覧。
 */

import { existsSync, statSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { IpcResponse } from "../../shared/types";
import type { BufferManager } from "../buffer/manager";

/**
 * view コマンドハンドラ。
 */
export async function handleView(
  args: Record<string, unknown>,
  bufferManager: BufferManager
): Promise<IpcResponse> {
  const path = args.path as string | undefined;
  const range = args.range as string | undefined;

  if (!path) {
    return { ok: false, error: "Missing required arg: path" };
  }

  const absPath = resolve(path);

  if (!existsSync(absPath)) {
    return { ok: false, error: `Path not found: ${absPath}` };
  }

  const stat = statSync(absPath);

  // ディレクトリの場合
  if (stat.isDirectory()) {
    try {
      const entries = readdirSync(absPath);
      const output = entries.join("\n");
      return { ok: true, data: output };
    } catch (err) {
      return {
        ok: false,
        error: `Failed to read directory: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ファイルの場合
  try {
    const lineCount = bufferManager.getLineCount(absPath);

    let startLine = 1;
    let endLine = lineCount;

    // 行範囲解析
    if (range) {
      const match = /^(\d+):(\d+)$/.exec(range);
      if (!match) {
        return { ok: false, error: "Invalid range format. Use: <start>:<end>" };
      }
      startLine = parseInt(match[1], 10);
      endLine = parseInt(match[2], 10);

      if (startLine < 1 || endLine > lineCount || startLine > endLine) {
        return {
          ok: false,
          error: `Invalid range: ${startLine}:${endLine} (file has ${lineCount} lines)`,
        };
      }
    }

    // 200行制限: 範囲指定なしで200行超過時は head/tail 形式
    const MAX_LINES = 200;
    const HEAD_LINES = 100;
    const TAIL_LINES = 20;

    if (!range && (endLine - startLine + 1) > MAX_LINES) {
      const output: string[] = [];

      // 先頭100行
      for (let i = 1; i <= HEAD_LINES; i++) {
        const lineNum = String(i).padStart(5, " ");
        output.push(`${lineNum}: ${bufferManager.getLineContent(absPath, i)}`);
      }

      // 省略メッセージ
      const omitted = lineCount - HEAD_LINES - TAIL_LINES;
      output.push("");
      output.push(`... (${omitted} lines omitted) ...`);
      output.push("");

      // 末尾20行
      for (let i = lineCount - TAIL_LINES + 1; i <= lineCount; i++) {
        const lineNum = String(i).padStart(5, " ");
        output.push(`${lineNum}: ${bufferManager.getLineContent(absPath, i)}`);
      }

      return { ok: true, data: output.join("\n") };
    }

    // 通常出力（200行以下 or 範囲指定あり）
    const output: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      const lineNum = String(i).padStart(5, " ");
      output.push(`${lineNum}: ${bufferManager.getLineContent(absPath, i)}`);
    }

    return { ok: true, data: output.join("\n") };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
