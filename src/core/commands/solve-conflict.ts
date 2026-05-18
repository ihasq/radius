/**
 * solve-conflict コマンドハンドラ。
 *
 * Git コンフリクトマーカーの表示と解決を行う。
 */

import { resolve } from "node:path";
import { parseConflicts, type ConflictRegion } from "../conflict/parser";
import { LspManager } from "../../lsp/manager";
import { HistoryTracker } from "../history/tracker";
import { findProjectRoot } from "../../shared/project";
import type { Changeset } from "../history/types";
import type { IpcResponse } from "../../shared/types";
import type { BufferManager } from "../buffer/manager";
import { collectAndFormatWithTracking } from "../../lsp/diagnostics";
import type { DiagnosticRegistry } from "../../lsp/diagnostic-registry";
import { filepath, removed, added } from "../../shared/colors";

/**
 * solve-conflict コマンドのエントリポイント。
 */
export async function handleSolveConflict(
  args: Record<string, unknown>,
  lspManager: LspManager,
  historyTracker: HistoryTracker,
  bufferManager: BufferManager,
  diagnosticRegistry: DiagnosticRegistry
): Promise<IpcResponse> {
  const filePath = args.file as string | undefined;
  if (!filePath) {
    return { ok: false, error: "Missing required arg: file" };
  }

  const absPath = resolve(filePath);

  // ファイル読み取り
  let content: string;
  try {
    content = bufferManager.getContent(absPath);
  } catch {
    return { ok: false, error: `Cannot read file: ${absPath}` };
  }

  // コンフリクトパース
  const parseResult = parseConflicts(absPath, content);

  // 読み取りモード（args に accept, id, content がない場合）
  if (!args.accept && !args.content) {
    return { ok: true, data: formatReadMode(parseResult) };
  }

  // 解決モード
  const accept = args.accept as "ours" | "theirs" | undefined;
  const conflictId = args.id ? parseInt(args.id as string, 10) : undefined;
  const customContent = args.content as string | undefined;

  // 引数検証
  if (customContent && conflictId === undefined) {
    return { ok: false, error: "--content requires --id" };
  }

  if (customContent && accept) {
    return { ok: false, error: "--content and --accept are mutually exclusive" };
  }

  if (!customContent && !accept) {
    return { ok: false, error: "Must specify --accept or --content" };
  }

  // コンフリクトがない場合
  if (parseResult.conflictCount === 0) {
    return { ok: false, error: "No conflicts found in file" };
  }

  // 個別解決時のID検証
  if (conflictId !== undefined) {
    const found = parseResult.conflicts.find((c) => c.id === conflictId);
    if (!found) {
      return { ok: false, error: `Conflict ID ${conflictId} not found` };
    }
  }

  // B3: 変更前の内容を保存
  const beforeContent = content;

  // 解決実行
  const resolvedContent = resolveConflicts(
    content,
    parseResult.conflicts,
    conflictId,
    accept,
    customContent
  );

  // ファイル書き込み（BufferManager経由）
  const contentLength = bufferManager.getContent(absPath).length;
  bufferManager.delete(absPath, 0, contentLength);
  bufferManager.insert(absPath, 0, resolvedContent);
  bufferManager.flush(absPath);

  // B3: Changeset 記録
  const changeset: Changeset = {
    id: String(Date.now()),
    timestamp: new Date().toISOString(),
    command: "solve-conflict",
    description: conflictId
      ? `conflict ${conflictId} → ${customContent ? "custom" : accept}`
      : `all conflicts → ${accept}`,
    changes: [
      {
        filePath: absPath,
        before: beforeContent,
        after: resolvedContent,
      },
    ],
  };
  await historyTracker.record(changeset);

  // 残存コンフリクトの確認
  const afterParse = parseConflicts(absPath, resolvedContent);

  // 出力フォーマット
  const output = formatResolveMode(absPath, parseResult, conflictId, accept, customContent, afterParse.conflictCount);

  // LSP診断情報を収集（ID付与・差分検出）
  const diagnosticsOutput = await collectAndFormatWithTracking(
    lspManager,
    diagnosticRegistry,
    absPath,
    resolvedContent
  );

  return { ok: true, data: output + "\n" + diagnosticsOutput };
}

/**
 * 読み取りモードの出力フォーマット。
 */
function formatReadMode(parseResult: { filePath: string; conflictCount: number; conflicts: ConflictRegion[] }): string {
  const header = [
    `file: ${filepath(parseResult.filePath)}`,
    `conflicts: ${parseResult.conflictCount}`,
  ].join("\n");

  if (parseResult.conflictCount === 0) {
    return header;
  }

  const body = parseResult.conflicts.map((conflict) => {
    const lines = [`\n=== conflict ${conflict.id} (lines ${conflict.oursStartLine}-...) ===`];

    lines.push(removed("--- ours (HEAD) ---"));
    lines.push(...conflict.ours.map((line) => removed(`  ${line}`)));

    if (conflict.base) {
      lines.push("--- base ---");
      lines.push(...conflict.base.map((line) => `  ${line}`));
    }

    lines.push(added(`--- theirs (${conflict.theirsBranch}) ---`));
    lines.push(...conflict.theirs.map((line) => added(`  ${line}`)));

    return lines.join("\n");
  }).join("\n");

  return header + "\n" + body;
}

/**
 * 解決モードの出力フォーマット。
 */
function formatResolveMode(
  filePath: string,
  parseResult: { conflicts: ConflictRegion[] },
  conflictId: number | undefined,
  accept: "ours" | "theirs" | undefined,
  customContent: string | undefined,
  remainingCount: number
): string {
  const resolved: string[] = [];

  if (conflictId !== undefined) {
    const resolveType = customContent ? "custom" : accept;
    resolved.push(`resolved: conflict ${conflictId} → ${resolveType}`);
  } else {
    for (const conflict of parseResult.conflicts) {
      resolved.push(`resolved: conflict ${conflict.id} → ${accept}`);
    }
  }

  resolved.push(`file: ${filepath(filePath)}`);
  resolved.push(`remaining conflicts: ${remainingCount}`);

  return resolved.join("\n");
}

/**
 * コンフリクトを解決する。
 */
function resolveConflicts(
  content: string,
  conflicts: ConflictRegion[],
  conflictId: number | undefined,
  accept: "ours" | "theirs" | undefined,
  customContent: string | undefined
): string {
  const lines = content.split("\n");
  const targetConflicts = conflictId
    ? conflicts.filter((c) => c.id === conflictId)
    : conflicts;

  // D1: 全コンフリクトのマーカー位置を事前に特定
  interface ResolveInfo {
    startIdx: number;
    endIdx: number;
    resolvedLines: string[];
  }
  const resolveInfos: ResolveInfo[] = [];

  for (const conflict of targetConflicts) {
    // マーカーの位置を特定
    let startIdx = -1;
    let endIdx = -1;

    // <<<<<<< を探す
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.startsWith("<<<<<<<")) {
        // この位置から conflict を再構築して一致するか確認
        const testOurs: string[] = [];
        let j = i + 1;
        while (j < lines.length && !lines[j]?.startsWith("||||||| ") && !lines[j]?.startsWith("=======")) {
          testOurs.push(lines[j] || "");
          j++;
        }

        // ours が一致するか確認
        if (arraysEqual(testOurs, conflict.ours)) {
          startIdx = i;
          // >>>>>>> の位置を探す
          for (let k = j; k < lines.length; k++) {
            if (lines[k]?.startsWith(">>>>>>>")) {
              endIdx = k;
              break;
            }
          }
          break;
        }
      }
    }

    if (startIdx === -1 || endIdx === -1) {
      continue; // このコンフリクトは既に解決済みか見つからない
    }

    // 解決内容を決定
    let resolvedLines: string[];
    if (customContent !== undefined) {
      resolvedLines = customContent.split("\n");
    } else if (accept === "ours") {
      resolvedLines = conflict.ours;
    } else {
      resolvedLines = conflict.theirs;
    }

    resolveInfos.push({ startIdx, endIdx, resolvedLines });
  }

  // D1: endIdx の降順でソート（後ろから適用）
  resolveInfos.sort((a, b) => b.endIdx - a.endIdx);

  // D1: 後ろから順に置換実行
  for (const info of resolveInfos) {
    lines.splice(info.startIdx, info.endIdx - info.startIdx + 1, ...info.resolvedLines);
  }

  return lines.join("\n");
}

/**
 * 配列の等価性チェック。
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
