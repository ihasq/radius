/**
 * LSP診断情報の収集とフォーマット。
 */

import type { LspManager } from "./manager";
import type { LspDiagnostic } from "./types";
import { DiagnosticSeverity } from "./types";
import { findProjectRoot } from "../shared/project";
import { diagnostic as colorDiagnostic } from "../shared/colors";
import type { DiagnosticDiff, DiagnosticRegistry } from "./diagnostic-registry";
import type { TsRadManager } from "../core/ts-service/manager";
import ts from "typescript";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** 診断情報の収集結果 */
export interface DiagnosticReport {
  uri: string;
  diagnostics: LspDiagnostic[];
  content: string;
}

/**
 * 指定ファイルのLSP診断情報を収集する。
 *
 * @param lspManager - LSPマネージャインスタンス
 * @param filePath - 対象ファイルの絶対パス
 * @param content - ファイルの更新後の内容
 * @param waitMs - 診断情報が到着するまでの待機時間（デフォルト500ms）
 * @returns 診断情報のレポート、またはLSPが利用できない場合null
 */
export async function collectDiagnostics(
  lspManager: LspManager,
  filePath: string,
  content: string,
  waitMs: number = 3000,
  tsRadManager?: TsRadManager
): Promise<DiagnosticReport | null> {
  const projectRoot = findProjectRoot(filePath);
  const uri = `file://${filePath}`;

  // TypeScript/JavaScript ファイルは ts-rad で診断
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx") {
    return collectDiagnosticsWithTsRad(filePath, content, projectRoot, uri, tsRadManager);
  }

  // その他の言語は LSP を使用
  const client = lspManager.getExistingClient(projectRoot);

  if (!client) {
    return null;
  }

  // ドキュメントを開いて更新内容を送信
  const languageId = getLanguageIdFromPath(filePath);
  client.ensureOpen(uri, languageId, content);

  // LSPサーバが診断情報を送信するまで待機
  await Bun.sleep(waitMs);

  // 診断情報を取得
  const diagnostics = client.getDiagnostics(uri);

  return {
    uri,
    diagnostics,
    content,
  };
}

/**
 * ts-rad (in-process Language Service) を使用して診断情報を収集する。
 */
function collectDiagnosticsWithTsRad(
  filePath: string,
  content: string,
  projectRoot: string,
  uri: string,
  tsRadManager?: TsRadManager
): DiagnosticReport | null {
  // tsconfig.json を探す
  const tsconfigPath = join(projectRoot, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    return null;
  }

  try {
    // TsRadManager があれば使用、なければ一時的にサービスを作成
    const service = tsRadManager
      ? tsRadManager.getService(projectRoot, 3)
      : (() => {
          const { host } = require("../core/ts-service/host").createDepth3Host(projectRoot);
          return ts.createLanguageService(host);
        })();
    const disposeService = !tsRadManager;

    try {
      // 構文診断と意味診断を取得
      const syntactic = service.getSyntacticDiagnostics(filePath);
      const semantic = service.getSemanticDiagnostics(filePath);
      const allDiagnostics = [...syntactic, ...semantic];

      // TypeScript診断を LSP 形式に変換
      const lspDiagnostics = allDiagnostics.map(d => convertTsDiagnosticToLsp(d));

      return {
        uri,
        diagnostics: lspDiagnostics,
        content,
      };
    } finally {
      if (disposeService) {
        service.dispose();
      }
    }
  } catch (err) {
    // ts-rad 失敗時でも空のレポートを返す
    return {
      uri,
      diagnostics: [],
      content,
    };
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
 * 診断情報をLLM可読形式でフォーマットする。
 */
export function formatDiagnostics(report: DiagnosticReport): string {
  if (report.diagnostics.length === 0) {
    return "no diagnostics";
  }

  const lines = report.content.split("\n");
  const output: string[] = [];

  // 診断情報を行番号でソート
  const sorted = [...report.diagnostics].sort((a, b) => {
    return a.range.start.line - b.range.start.line;
  });

  for (const diag of sorted) {
    const severityLabel = getSeverityLabel(diag.severity);
    const severityType = getSeverityType(diag.severity);
    const line = diag.range.start.line + 1; // 1-indexed
    const col = diag.range.start.character + 1;
    const code = diag.code ? ` [${diag.code}]` : "";
    const source = diag.source ? ` (${diag.source})` : "";

    // ヘッダー（カラー適用）
    const header = `${severityLabel} at line ${line}, col ${col}${code}${source}:`;
    output.push(colorDiagnostic(header, severityType));
    output.push(colorDiagnostic(`  ${diag.message}`, severityType));

    // コンテキスト（該当行の前後1行）
    const startLine = Math.max(0, diag.range.start.line - 1);
    const endLine = Math.min(lines.length - 1, diag.range.start.line + 1);

    for (let i = startLine; i <= endLine; i++) {
      const marker = i === diag.range.start.line ? ">" : " ";
      const lineNum = String(i + 1).padStart(4, " ");
      output.push(`  ${marker}${lineNum}: ${lines[i]}`);
    }

    output.push(""); // 空行で区切り
  }

  return output.join("\n").trim();
}

/** ファイルパスからLanguageIDを推測 */
function getLanguageIdFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
      return "typescript";
    case "tsx":
      return "typescriptreact";
    case "js":
      return "javascript";
    case "jsx":
      return "javascriptreact";
    case "rs":
      return "rust";
    default:
      return "plaintext";
  }
}

/** 診断重要度のラベルを取得 */
function getSeverityLabel(severity?: number): string {
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
      return "diagnostic";
  }
}

/** 診断重要度を色付け用の型に変換 */
function getSeverityType(severity?: number): "error" | "warning" | "info" | "hint" {
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
      return "info";
  }
}

/**
 * 診断重要度の絵文字を取得
 */
function severityEmoji(severity: number): string {
  switch (severity) {
    case 1: // Error
      return "❌";
    case 2: // Warning
      return "⚠️";
    case 3: // Information
      return "ℹ️";
    case 4: // Hint
      return "ℹ️";
    default:
      return "❓";
  }
}

/**
 * DiagnosticDiff をLLM可読テキストにフォーマットする。
 */
export function formatDiagnosticDiff(diff: DiagnosticDiff): string {
  const allActive = [...diff.active, ...diff.added];

  // エラーと警告の件数をカウント
  const errorCount = allActive.filter(d => d.severity === 1).length;
  const warningCount = allActive.filter(d => d.severity === 2).length;

  const output: string[] = [];

  // サマリ行
  if (errorCount === 0 && warningCount === 0) {
    output.push("diagnostics: ok (0 errors, 0 warnings — your edit introduced no type or syntax issues)");
  } else {
    const parts: string[] = [];
    if (errorCount > 0) {
      parts.push(`❌ ${errorCount} error${errorCount > 1 ? "s" : ""}`);
    }
    if (warningCount > 0) {
      parts.push(`⚠️ ${warningCount} warning${warningCount > 1 ? "s" : ""}`);
    }
    output.push(`diagnostics: ${parts.join(", ")}`);
  }

  // 個別診断行
  if (allActive.length > 0) {
    const MAX_DISPLAY = 10;
    const toDisplay = allActive.slice(0, MAX_DISPLAY);

    for (const diag of toDisplay) {
      const emoji = severityEmoji(diag.severity);
      const codeStr = diag.code ? `[${diag.code}] ` : "";
      output.push(`  ${emoji} ${diag.id} ${codeStr}(line ${diag.line}): ${diag.message}`);
    }

    if (allActive.length > MAX_DISPLAY) {
      output.push(`  ... and ${allActive.length - MAX_DISPLAY} more`);
    }

    // エラーがある場合は対処法を追加
    if (errorCount > 0) {
      output.push("");
      output.push("> These errors were introduced by your edit. Use `radius fix <file> --tag <tag>` to auto-fix,");
      output.push("> or `radius str-replace` to manually correct the code.");
      output.push("> Do NOT proceed with further edits until diagnostics show 0 errors.");
    }
  }

  // resolved セクション
  if (diff.resolved.length > 0) {
    output.push("");
    output.push("resolved:");
    for (const diag of diff.resolved) {
      const codeStr = diag.code ? `[${diag.code}] ` : "";
      output.push(`  ✅ ${diag.id} ${codeStr}(line ${diag.line}): ${diag.message}`);
    }
    output.push("");
    const count = diff.resolved.length;
    output.push(`${count} issue${count > 1 ? "s" : ""} resolved by this change.`);
  }

  return output.join("\n");
}

/**
 * 診断情報を収集してID付与・差分検出・フォーマットを行う統合関数。
 *
 * @param lspManager - LSPマネージャインスタンス
 * @param diagnosticRegistry - 診断レジストリ
 * @param filePath - 対象ファイルの絶対パス
 * @param content - ファイルの更新後の内容
 * @returns フォーマット済みの診断テキスト
 */
export async function collectAndFormatWithTracking(
  lspManager: LspManager,
  diagnosticRegistry: DiagnosticRegistry,
  filePath: string,
  content: string,
  tsRadManager?: TsRadManager
): Promise<string> {
  const report = await collectDiagnostics(lspManager, filePath, content, 3000, tsRadManager);

  if (!report) {
    return "diagnostics: skipped (not a TypeScript file — static analysis is only available for .ts/.tsx)";
  }

  const diff = diagnosticRegistry.update(filePath, report.diagnostics);
  diagnosticRegistry.save();

  return formatDiagnosticDiff(diff);
}
