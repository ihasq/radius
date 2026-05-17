/**
 * Phase 15: replace コマンド
 *
 * 単一ファイル内のパターン一括置換。
 */

import { existsSync } from "node:fs";
import type { IpcRequest, IpcResponse, ChangeMetadata } from "../../shared/types";
import type { DaemonContext } from "../../daemon/registry";
import { replaceInContent, type SearchOptions } from "../search/engine";
import { collectDiagnostics, formatDiagnostics } from "../../lsp/diagnostics";
import { findProjectRoot } from "../../shared/project";
import { marker as colorMarker } from "../../shared/colors";

export async function handleReplace(
  request: IpcRequest,
  ctx: DaemonContext
): Promise<IpcResponse> {
  const { args, cwd, stdin } = request;

  let filePath = args.file as string | undefined;
  let pattern: string | undefined;
  let replacement: string | undefined;
  let isRegex = args.regex === true;
  let ignoreCase = args["ignore-case"] === true;
  let maxReplacements: number | undefined = args.max ? parseInt(String(args.max), 10) : undefined;

  // --stdin オプション処理
  if (args.stdin && stdin) {
    try {
      const parsed = JSON.parse(stdin);
      pattern = parsed.pattern;
      replacement = parsed.replacement;
      isRegex = parsed.regex === true;
      ignoreCase = parsed.ignoreCase === true;
    } catch (err) {
      return { ok: false, error: `invalid JSON in stdin: ${(err as Error).message}` };
    }
  } else {
    pattern = args.pattern as string | undefined;
    replacement = args.replacement as string | undefined;
  }

  // 引数検証
  if (!filePath) {
    return { ok: false, error: "missing argument: <file>" };
  }

  if (!pattern) {
    return { ok: false, error: "missing required option: --pattern" };
  }

  if (replacement === undefined) {
    return { ok: false, error: "missing required option: --replacement" };
  }

  if (!existsSync(filePath)) {
    return { ok: false, error: `file not found: ${filePath}` };
  }

  // 検索オプション構築
  const searchOpts: SearchOptions = {
    pattern,
    isRegex,
    ignoreCase,
  };

  // 正規表現検証
  try {
    new RegExp(searchOpts.isRegex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  } catch (err) {
    return { ok: false, error: `invalid regex pattern: ${(err as Error).message}` };
  }

  // バッファマネージャからファイル内容取得
  const oldContent = ctx.bufferManager.getContent(filePath);

  // 置換実行
  const result = replaceInContent(oldContent, searchOpts, replacement, maxReplacements);

  if (result.count === 0) {
    return { ok: false, error: "no matches found for pattern." };
  }

  // バッファに反映（全内容を置き換え）
  const oldLength = oldContent.length;
  ctx.bufferManager.delete(filePath, 0, oldLength);
  ctx.bufferManager.insert(filePath, 0, result.newContent);
  ctx.bufferManager.flush(filePath);

  // Changeset記録
  const projectRoot = findProjectRoot(cwd || process.cwd());
  const chainId = (request as any).chainId as string;
  const historyTracker = ctx.getHistoryTracker(projectRoot, chainId);

  const changeset = {
    id: String(Date.now()),
    timestamp: new Date().toISOString(),
    command: "replace",
    description: `replaced ${result.count} occurrence(s) in ${filePath}`,
    changes: [
      {
        filePath,
        before: oldContent,
        after: result.newContent,
      },
    ],
  };

  await historyTracker.record(changeset);

  // LSP診断収集
  const diagnosticReport = await collectDiagnostics(ctx.lspManager, filePath, result.newContent);
  let diagnosticsOutput = "diagnostics: ok";

  if (diagnosticReport && diagnosticReport.diagnostics.length > 0) {
    diagnosticsOutput = `diagnostics:\n${formatDiagnostics(diagnosticReport)}`;
  }

  // 出力生成
  const lines: string[] = [];
  lines.push(`replaced ${result.count} occurrence${result.count !== 1 ? "s" : ""} in ${filePath}`);
  lines.push("");

  // 変更箇所をコンテキスト付きで表示
  const contentLines = result.newContent.split("\n");
  const changedLines = result.matches.map((m) => m.line);
  const formatted = formatChangeContext(contentLines, changedLines);
  lines.push(formatted);

  lines.push("");
  lines.push(diagnosticsOutput);

  // Phase 16: 変更メタデータを計算
  const changeMetadata = calculateChangeMetadata(filePath, result.matches, oldContent, result.newContent);

  return {
    ok: true,
    data: lines.join("\n"),
    changes: changeMetadata ? [changeMetadata] : undefined,
  };
}

/**
 * Phase 16: 変更メタデータを計算する。
 */
function calculateChangeMetadata(
  filePath: string,
  matches: Array<{ line: number }>,
  oldContent: string,
  newContent: string
): ChangeMetadata | null {
  if (matches.length === 0) return null;

  // 全変更行の最小・最大を取得
  const changedLines = matches.map((m) => m.line);
  const startLine = Math.min(...changedLines);
  const endLine = Math.max(...changedLines);

  // 行数の変化を計算
  const oldLines = oldContent.split("\n").length;
  const newLines = newContent.split("\n").length;
  const lineDelta = newLines - oldLines;

  return {
    filePath,
    startLine,
    endLine,
    newEndLine: endLine + lineDelta,
  };
}

/**
 * 変更箇所のコンテキストを行番号付きで表示する。
 */
function formatChangeContext(contentLines: string[], changedLines: number[]): string {
  const output: string[] = [];
  const changedSet = new Set(changedLines);

  // 全ての変更行の周辺を表示（重複は自動的にマージされる）
  const linesToShow = new Set<number>();
  for (const line of changedLines) {
    const startLine = Math.max(1, line - 2);
    const endLine = Math.min(contentLines.length, line + 2);
    for (let i = startLine; i <= endLine; i++) {
      linesToShow.add(i);
    }
  }

  const sortedLines = Array.from(linesToShow).sort((a, b) => a - b);

  for (const lineNum of sortedLines) {
    const marker = changedSet.has(lineNum) ? ">" : " ";
    const paddedNum = String(lineNum).padStart(4, " ");
    const line = `${marker}${paddedNum}: ${contentLines[lineNum - 1]}`;
    output.push(changedSet.has(lineNum) ? colorMarker(line) : line);
  }

  return output.join("\n");
}
