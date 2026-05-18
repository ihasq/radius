/**
 * 出力フォーマットの共通ユーティリティ。
 *
 * 全コマンドの変更コンテキスト出力、エラーレスポンス生成に使用する。
 */

import { marker as colorMarker, added } from "./colors";
import type { IpcResponse } from "./types";

/** コンテキスト表示オプション */
export interface ContextOptions {
  /** ファイルの全行（改行で分割済み） */
  lines: string[];
  /** マーカーを付ける行番号の配列（0-indexed） */
  highlightLines: number[];
  /** 前後に表示するコンテキスト行数（デフォルト3） */
  contextLines?: number;
  /** ハイライト行に適用するカラー関数（デフォルト: marker） */
  colorFn?: (line: string) => string;
}

/**
 * 指定行の前後コンテキストを > マーカー付きで生成する。
 * 全コマンドの変更コンテキスト出力に使用する。
 */
export function formatContext(options: ContextOptions): string {
  const { lines, highlightLines, contextLines = 3, colorFn = colorMarker } = options;

  if (highlightLines.length === 0 || lines.length === 0) {
    return "";
  }

  // 表示範囲を計算（複数のハイライト行がある場合は統合）
  const minHighlight = Math.min(...highlightLines);
  const maxHighlight = Math.max(...highlightLines);
  const startLine = Math.max(0, minHighlight - contextLines);
  const endLine = Math.min(lines.length - 1, maxHighlight + contextLines);

  // 行番号の桁数を計算
  const maxLineNum = endLine + 1;
  const padWidth = String(maxLineNum).length;

  // 出力生成
  const output: string[] = [];
  const highlightSet = new Set(highlightLines);

  for (let i = startLine; i <= endLine; i++) {
    const lineNum = String(i + 1).padStart(padWidth + 1, " ");
    const isHighlight = highlightSet.has(i);
    const marker = isHighlight ? ">" : " ";
    const line = `${marker}${lineNum}: ${lines[i]}`;
    output.push(isHighlight ? colorFn(line) : line);
  }

  return output.join("\n");
}

/**
 * ファイル内容のプレビューを生成する。
 * 20行以下は全文、超過時は先頭10行 + 省略メッセージ。
 */
export function formatPreview(content: string, maxLines: number = 20): string {
  const lines = content.split("\n");
  const previewLines = maxLines > 20 ? 10 : Math.floor(maxLines / 2);

  if (lines.length <= maxLines) {
    // 全文表示（行番号付き、全行緑）
    const padWidth = String(lines.length).length;
    return lines
      .map((line, i) => {
        const lineNum = String(i + 1).padStart(padWidth + 1, " ");
        return added(` ${lineNum}: ${line}`);
      })
      .join("\n");
  } else {
    // 先頭N行 + 省略メッセージ（全行緑）
    const padWidth = String(previewLines).length;
    const preview = lines
      .slice(0, previewLines)
      .map((line, i) => {
        const lineNum = String(i + 1).padStart(padWidth + 1, " ");
        return added(` ${lineNum}: ${line}`);
      })
      .join("\n");
    return `${preview}\n... (${lines.length - previewLines} more lines)`;
  }
}

/**
 * エラーレスポンスを生成する。
 */
export function errorResponse(message: string): IpcResponse {
  return { ok: false, error: message };
}

/**
 * 成功レスポンスを生成する。
 */
export function okResponse(data: string, extra?: Record<string, unknown>): IpcResponse {
  return { ok: true, data, ...extra };
}
