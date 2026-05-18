/**
 * LSP診断情報の収集とフォーマット。
 */

import type { LspManager } from "./manager";
import type { LspDiagnostic } from "./types";
import { DiagnosticSeverity } from "./types";
import { findProjectRoot } from "../shared/project";
import { diagnostic as colorDiagnostic } from "../shared/colors";
import type { DiagnosticDiff, TrackedDiagnostic, DiagnosticRegistry } from "./diagnostic-registry";

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
  waitMs: number = 3000
): Promise<DiagnosticReport | null> {
  const projectRoot = findProjectRoot(filePath);
  const client = await lspManager.getClient(filePath, projectRoot);

  if (!client) {
    return null;
  }

  const uri = `file://${filePath}`;

  // ドキュメントを開いて更新内容を送信
  // languageId は拡張子から推測（簡易版）
  const languageId = getLanguageIdFromPath(filePath);

  // 既存ドキュメントをクローズしてから再オープン（診断情報をリフレッシュ）
  client.closeDocument(uri);
  client.openDocument(uri, languageId, content, 1);

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
    output.push("diagnostics: ok");
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
  content: string
): Promise<string> {
  const report = await collectDiagnostics(lspManager, filePath, content);

  if (!report) {
    return "diagnostics: unavailable (no LSP for this file type)";
  }

  const diff = diagnosticRegistry.update(filePath, report.diagnostics);
  diagnosticRegistry.save();

  return formatDiagnosticDiff(diff);
}
