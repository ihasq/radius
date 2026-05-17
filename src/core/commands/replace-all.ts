/**
 * Phase 15: replace-all コマンド
 *
 * ディレクトリ配下の複数ファイルでパターン一括置換。
 */

import { existsSync, statSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import type { IpcRequest, IpcResponse, ChangeMetadata } from "../../shared/types";
import type { DaemonContext } from "../../daemon/registry";
import { replaceInContent, type SearchOptions } from "../search/engine";
import { findFiles, type GlobOptions } from "../search/glob";
import { collectDiagnostics, formatDiagnostics, type DiagnosticReport } from "../../lsp/diagnostics";
import { findProjectRoot } from "../../shared/project";
import { marker as colorMarker } from "../../shared/colors";

export async function handleReplaceAll(
  request: IpcRequest,
  ctx: DaemonContext
): Promise<IpcResponse> {
  const { args, cwd, stdin } = request;

  let dir = args.dir as string | undefined;
  let pattern: string | undefined;
  let replacement: string | undefined;
  let isRegex = args.regex === true;
  let ignoreCase = args["ignore-case"] === true;
  let include: string[] | undefined;
  let exclude: string[] | undefined;

  // --stdin オプション処理
  if (args.stdin && stdin) {
    try {
      const parsed = JSON.parse(stdin);
      pattern = parsed.pattern;
      replacement = parsed.replacement;
      isRegex = parsed.regex === true;
      ignoreCase = parsed.ignoreCase === true;
      include = parsed.include;
      exclude = parsed.exclude;
    } catch (err) {
      return { ok: false, error: `invalid JSON in stdin: ${(err as Error).message}` };
    }
  } else {
    pattern = args.pattern as string | undefined;
    replacement = args.replacement as string | undefined;

    // --include と --exclude はカンマ区切り
    if (args.include) {
      include = String(args.include).split(",").map((s) => s.trim());
    }
    if (args.exclude) {
      exclude = String(args.exclude).split(",").map((s) => s.trim());
    }
  }

  // 引数検証
  if (!dir) {
    return { ok: false, error: "missing argument: <dir>" };
  }

  if (!pattern) {
    return { ok: false, error: "missing required option: --pattern" };
  }

  if (replacement === undefined) {
    return { ok: false, error: "missing required option: --replacement" };
  }

  if (!existsSync(dir)) {
    return { ok: false, error: `directory not found: ${dir}` };
  }

  const stat = statSync(dir);
  if (!stat.isDirectory()) {
    return { ok: false, error: `not a directory: ${dir}` };
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

  // ファイル一覧取得
  const globOpts: GlobOptions = {
    include,
    exclude,
  };

  const filesToProcess = findFiles(dir, globOpts);

  // 各ファイルで置換実行
  interface FileReplacement {
    filePath: string;
    oldContent: string;
    newContent: string;
    count: number;
    matches: Array<{ line: number; column: number; matchText: string; lineContent: string }>;
  }

  const replacements: FileReplacement[] = [];
  let totalReplacements = 0;

  for (const filePath of filesToProcess) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue; // 読み取り不可ファイルはスキップ
    }

    const result = replaceInContent(content, searchOpts, replacement);

    if (result.count > 0) {
      replacements.push({
        filePath,
        oldContent: content,
        newContent: result.newContent,
        count: result.count,
        matches: result.matches,
      });
      totalReplacements += result.count;
    }
  }

  if (replacements.length === 0) {
    return { ok: false, error: "no matches found in any files." };
  }

  // バッファマネージャに反映
  for (const rep of replacements) {
    const oldLength = rep.oldContent.length;
    ctx.bufferManager.delete(rep.filePath, 0, oldLength);
    ctx.bufferManager.insert(rep.filePath, 0, rep.newContent);
    ctx.bufferManager.flush(rep.filePath);
  }

  // Changeset記録（単一のChangesetに全ファイルの変更を記録）
  const projectRoot = findProjectRoot(cwd || process.cwd());
  const chainId = (request as any).chainId as string;
  const historyTracker = ctx.getHistoryTracker(projectRoot, chainId);

  const changeset = {
    id: String(Date.now()),
    timestamp: new Date().toISOString(),
    command: "replace-all",
    description: `replaced ${totalReplacements} occurrence(s) across ${replacements.length} file(s)`,
    changes: replacements.map((rep) => ({
      filePath: rep.filePath,
      before: rep.oldContent,
      after: rep.newContent,
    })),
  };

  await historyTracker.record(changeset);

  // LSP診断収集（変更されたファイル全て）
  const diagnosticReports: DiagnosticReport[] = [];

  for (const rep of replacements) {
    const report = await collectDiagnostics(ctx.lspManager, rep.filePath, rep.newContent);
    if (report && report.diagnostics.length > 0) {
      diagnosticReports.push(report);
    }
  }

  let diagnosticsOutput = "diagnostics: ok";
  if (diagnosticReports.length > 0) {
    const errorCount = diagnosticReports.reduce(
      (sum, r) => sum + r.diagnostics.filter((d) => d.severity === 1).length,
      0
    );
    const warningCount = diagnosticReports.reduce(
      (sum, r) => sum + r.diagnostics.filter((d) => d.severity === 2).length,
      0
    );

    if (errorCount > 0 || warningCount > 0) {
      const summary: string[] = [];
      if (errorCount > 0) summary.push(`${errorCount} error${errorCount !== 1 ? "s" : ""}`);
      if (warningCount > 0) summary.push(`${warningCount} warning${warningCount !== 1 ? "s" : ""}`);

      diagnosticsOutput = `diagnostics: ${summary.join(", ")}`;

      // エラーがあるファイルの診断情報を表示
      for (const report of diagnosticReports.filter((r) => r.diagnostics.some((d) => d.severity === 1))) {
        const relativePath = relative(cwd || process.cwd(), report.uri.replace("file://", ""));
        diagnosticsOutput += `\n\n--- ${relativePath} ---\n${formatDiagnostics(report)}`;
      }
    }
  }

  // 出力生成
  const lines: string[] = [];

  const patternDisplay = isRegex ? `/${pattern}/${ignoreCase ? "i" : ""}` : `"${pattern}"${ignoreCase ? " (ignore-case)" : ""}`;
  lines.push(`replace-all: ${patternDisplay}`);
  lines.push(`files scanned: ${filesToProcess.length}`);
  lines.push(`files modified: ${replacements.length}`);
  lines.push(`total replacements: ${totalReplacements}`);
  lines.push("");

  // ファイル数が100を超える場合は詳細を省略
  if (replacements.length > 100) {
    lines.push(`files modified: ${replacements.length} (details omitted, too many files)`);
  } else {
    // 各ファイルの変更内容を表示
    for (const rep of replacements) {
      const relativePath = relative(cwd || process.cwd(), rep.filePath);
      lines.push(`--- ${relativePath} (${rep.count} replacement${rep.count !== 1 ? "s" : ""}) ---`);

      const contentLines = rep.newContent.split("\n");
      const changedLines = rep.matches.map((m) => m.line);
      const formatted = formatChangeContext(contentLines, changedLines);
      lines.push(formatted);
      lines.push("");
    }
  }

  lines.push(diagnosticsOutput);

  // Phase 16: 変更メタデータを計算（全ファイル分）
  const changeMetadataList: ChangeMetadata[] = [];
  for (const rep of replacements) {
    const metadata = calculateChangeMetadata(rep.filePath, rep.matches, rep.oldContent, rep.newContent);
    if (metadata) {
      changeMetadataList.push(metadata);
    }
  }

  return {
    ok: true,
    data: lines.join("\n"),
    changes: changeMetadataList.length > 0 ? changeMetadataList : undefined,
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
 * 変更箇所のコンテキストを行番号付きで表示する（replace-all用は簡潔版）。
 */
function formatChangeContext(contentLines: string[], changedLines: number[]): string {
  const output: string[] = [];
  const changedSet = new Set(changedLines);

  // 全ての変更行の周辺を表示（重複は自動的にマージされる）
  const linesToShow = new Set<number>();
  for (const line of changedLines) {
    const startLine = Math.max(1, line - 1);
    const endLine = Math.min(contentLines.length, line + 1);
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
