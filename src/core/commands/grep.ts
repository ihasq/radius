/**
 * Phase 15: grep コマンド
 *
 * ファイルまたはディレクトリ内のパターン検索（読み取り専用）。
 */

import { existsSync, statSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import type { IpcRequest, IpcResponse } from "../../shared/types";
import { searchInContent, type SearchOptions } from "../search/engine";
import { findFiles } from "../search/glob";
import { marker } from "../../shared/colors";
import { errorResponse } from "../../shared/output";
import { analyzeFileContext, formatContextSection } from "../../shared/context";

export async function handleGrep(request: IpcRequest): Promise<IpcResponse> {
  const { args, cwd } = request;

  const target = args.target as string | undefined;
  const pattern = args.pattern as string | undefined;
  const isRegex = args.regex === true;
  const ignoreCase = args["ignore-case"] === true;
  const maxResults = args["max-results"] ? parseInt(String(args["max-results"]), 10) : 50;

  // 引数検証
  if (!target) {
    return errorResponse("missing argument: <file-or-dir>");
  }

  if (!pattern) {
    return errorResponse("missing required option: --pattern");
  }

  if (!existsSync(target)) {
    return errorResponse(`file or directory not found: ${target}`);
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
    return errorResponse(`invalid regex pattern: ${(err as Error).message}`);
  }

  const stat = statSync(target);
  let filesToSearch: string[] = [];

  if (stat.isFile()) {
    filesToSearch = [target];
  } else if (stat.isDirectory()) {
    filesToSearch = findFiles(target, {});
  } else {
    return errorResponse("target is not a file or directory");
  }

  // 検索実行
  interface FileMatch {
    filePath: string;
    matches: Array<{ line: number; lineContent: string }>;
  }

  const fileMatches: FileMatch[] = [];
  let totalMatches = 0;

  for (const filePath of filesToSearch) {
    if (totalMatches >= maxResults) break;

    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue; // 読み取り不可ファイルはスキップ
    }

    const remainingQuota = maxResults - totalMatches;
    const matches = searchInContent(content, searchOpts, remainingQuota);

    if (matches.length > 0) {
      fileMatches.push({
        filePath,
        matches: matches.map((m) => ({ line: m.line, lineContent: m.lineContent })),
      });
      totalMatches += matches.length;
    }
  }

  // 出力生成
  const lines: string[] = [];

  // ヘッダー
  const patternDisplay = isRegex ? `/${pattern}/${ignoreCase ? "i" : ""}` : `"${pattern}"${ignoreCase ? " (ignore-case)" : ""}`;
  lines.push(`search: ${patternDisplay}`);
  lines.push(`matches: ${totalMatches}`);

  if (totalMatches === 0) {
    lines.push("");
    lines.push("no matches found.");
    return { ok: true, data: lines.join("\n") };
  }

  lines.push("");

  // マッチ結果
  for (const fileMatch of fileMatches) {
    const relativePath = relative(cwd || process.cwd(), fileMatch.filePath);
    for (const match of fileMatch.matches) {
      const formattedLine = marker(`${relativePath}:${match.line}: ${match.lineContent}`);
      lines.push(formattedLine);
    }
  }

  if (totalMatches >= maxResults) {
    lines.push("");
    lines.push(`(results limited to ${maxResults})`);
  }

  // コンテキスト追加（5ファイル以下の場合のみ）
  if (fileMatches.length > 0 && fileMatches.length <= 5) {
    for (const fileMatch of fileMatches) {
      try {
        const content = readFileSync(fileMatch.filePath, "utf-8");
        const ctx = analyzeFileContext(fileMatch.filePath, content);
        if (ctx) {
          const contextSection = formatContextSection(ctx);
          if (contextSection) {
            lines.push(contextSection);
          }
        }
      } catch {
        // コンテキスト生成エラーは無視
      }
    }
  }

  return { ok: true, data: lines.join("\n") };
}
