/**
 * Phase 18: problems コマンドハンドラ。
 *
 * ファイルまたはディレクトリの診断情報を表示する。
 */

import { existsSync, statSync, readdirSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { findProjectRoot } from "../../shared/project";
import type { IpcResponse } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import { DiagnosticSeverity, type LspDiagnostic } from "../../lsp/types";
import { errorResponse } from "../../shared/output";
import type { TsRadManager } from "@radius/rdsx-ts/manager";
import ts from "typescript";

const MAX_FILES = 50;

/**
 * problems コマンドハンドラ。
 */
export async function handleProblems(
  args: Record<string, unknown>,
  lspManager: LspManager,
  bufferManager: BufferManager,
  cwd: string,
  tsRadManager: TsRadManager
): Promise<IpcResponse> {
  const path = args.path as string | undefined;

  // パスが指定されていない場合はカレントディレクトリ
  const targetPath = path ? resolve(path) : cwd;
  const projectRoot = findProjectRoot(targetPath);

  if (!existsSync(targetPath)) {
    return errorResponse(`Path not found: ${targetPath}`);
  }

  const stat = statSync(targetPath);
  let files: string[];

  if (stat.isFile()) {
    files = [targetPath];
  } else if (stat.isDirectory()) {
    files = collectFiles(targetPath, MAX_FILES);
  } else {
    return errorResponse(`Invalid path: ${targetPath}`);
  }

  // 診断情報を収集
  const allDiagnostics: Map<string, LspDiagnostic[]> = new Map();
  let errorCount = 0;
  let warningCount = 0;
  let fileCount = 0;

  for (const file of files) {
    const diagnostics = await getDiagnosticsForFile(file, projectRoot, lspManager, bufferManager, tsRadManager);
    if (diagnostics.length > 0) {
      allDiagnostics.set(file, diagnostics);
      fileCount++;
      for (const d of diagnostics) {
        if (d.severity === DiagnosticSeverity.Error) {
          errorCount++;
        } else if (d.severity === DiagnosticSeverity.Warning) {
          warningCount++;
        }
      }
    }
  }

  // 出力生成
  const targetRelative = relative(projectRoot, targetPath) || ".";

  if (allDiagnostics.size === 0) {
    return { ok: true, data: `problems: ${targetRelative} — 0 errors, 0 warnings (clean)` };
  }

  const output: string[] = [];
  output.push(`problems: ${targetRelative}/`, "");

  for (const [file, diagnostics] of allDiagnostics) {
    const relFile = relative(projectRoot, file);
    output.push(`${relFile}:`);

    for (const d of diagnostics) {
      const severityName = getSeverityName(d.severity);
      const line = d.range.start.line + 1;
      const code = d.code ? `[${d.code}]` : "";
      const source = d.source ? ` (${d.source})` : "";
      output.push(`  ${severityName}${code} line ${line}: ${d.message}${source}`);
    }
    output.push("");
  }

  output.push(`summary: ${errorCount} error(s), ${warningCount} warning(s) in ${fileCount} file(s)`);

  if (files.length >= MAX_FILES) {
    output.push(`... and more files not scanned (limit: ${MAX_FILES})`);
  }

  return { ok: true, data: output.join("\n") };
}

/**
 * 単一ファイルの診断情報を取得する。
 */
async function getDiagnosticsForFile(
  file: string,
  projectRoot: string,
  lspManager: LspManager,
  bufferManager: BufferManager,
  tsRadManager: TsRadManager
): Promise<LspDiagnostic[]> {
  // ファイル内容を取得
  let content: string;
  try {
    content = bufferManager.getContent(file);
  } catch {
    return [];
  }

  // TypeScript/JavaScript ファイルは ts-rad で診断
  const ext = file.split(".").pop()?.toLowerCase();
  if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx") {
    return getDiagnosticsWithTsRad(file, projectRoot, tsRadManager);
  }

  // その他の言語は LSP を使用
  const client = lspManager.getExistingClient(projectRoot);
  if (!client) {
    return [];
  }

  const uri = `file://${file}`;

  // 診断を待つ
  await new Promise(resolve => setTimeout(resolve, 500));

  const diagnostics = client.getDiagnostics(uri);

  return diagnostics;
}

/**
 * ts-rad (in-process Language Service) を使用して診断情報を取得する。
 */
function getDiagnosticsWithTsRad(
  filePath: string,
  projectRoot: string,
  tsRadManager: TsRadManager
): LspDiagnostic[] {
  const tsconfigPath = join(projectRoot, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    return [];
  }

  try {
    const service = tsRadManager.getService(projectRoot, 3);

    const syntactic = service.getSyntacticDiagnostics(filePath);
    const semantic = service.getSemanticDiagnostics(filePath);
    const allDiagnostics = [...syntactic, ...semantic];

    // TypeScript診断を LSP 形式に変換
    return allDiagnostics.map(d => convertTsDiagnosticToLsp(d));
  } catch (err) {
    return [];
  }
}

/**
 * TypeScript 診断を LSP 診断形式に変換する。
 */
function convertTsDiagnosticToLsp(d: ts.Diagnostic): LspDiagnostic {
  const file = d.file;
  let start = { line: 0, character: 0 };
  let end = { line: 0, character: 0 };

  if (file && d.start !== undefined) {
    const startPos = file.getLineAndCharacterOfPosition(d.start);
    start = { line: startPos.line, character: startPos.character };

    if (d.length !== undefined) {
      const endPos = file.getLineAndCharacterOfPosition(d.start + d.length);
      end = { line: endPos.line, character: endPos.character };
    } else {
      end = start;
    }
  }

  // Severity 変換
  let severity: number;
  switch (d.category) {
    case ts.DiagnosticCategory.Error:
      severity = DiagnosticSeverity.Error;
      break;
    case ts.DiagnosticCategory.Warning:
      severity = DiagnosticSeverity.Warning;
      break;
    case ts.DiagnosticCategory.Message:
      severity = DiagnosticSeverity.Information;
      break;
    case ts.DiagnosticCategory.Suggestion:
      severity = DiagnosticSeverity.Hint;
      break;
    default:
      severity = DiagnosticSeverity.Information;
  }

  return {
    range: { start, end },
    severity,
    code: d.code,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    source: "ts-rad",
  };
}

/**
 * ディレクトリ内のファイルを収集する。
 */
function collectFiles(dir: string, maxFiles: number): string[] {
  const files: string[] = [];
  const extensions = [".ts", ".tsx", ".js", ".jsx"];

  function walk(currentDir: string) {
    if (files.length >= maxFiles) return;

    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;

      const fullPath = join(currentDir, entry.name);

      // node_modules と隠しディレクトリをスキップ
      if (entry.name === "node_modules" || entry.name.startsWith(".")) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = entry.name.substring(entry.name.lastIndexOf("."));
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * 診断の重要度を文字列に変換する。
 */
function getSeverityName(severity?: number): string {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return "error";
    case DiagnosticSeverity.Warning:
      return "warning";
    case DiagnosticSeverity.Information:
      return "info";
    case DiagnosticSeverity.Hint:
      return "hint";
    default:
      return "unknown";
  }
}

/**
 * ファイル拡張子から言語IDを取得する。
 */
function getLanguageId(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    default:
      return "plaintext";
  }
}
