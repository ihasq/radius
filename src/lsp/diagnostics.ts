/**
 * LSP診断情報の収集とフォーマット。
 */

import type { LspManager } from "./manager";
import type { LspDiagnostic } from "./types";
import { DiagnosticSeverity } from "./types";
import { findProjectRoot } from "../shared/project";

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
    const severity = getSeverityLabel(diag.severity);
    const line = diag.range.start.line + 1; // 1-indexed
    const col = diag.range.start.character + 1;
    const code = diag.code ? ` [${diag.code}]` : "";
    const source = diag.source ? ` (${diag.source})` : "";

    // ヘッダー
    output.push(`${severity} at line ${line}, col ${col}${code}${source}:`);
    output.push(`  ${diag.message}`);

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
