/**
 * Koloristを使用した行単位のカラーリングユーティリティ。
 *
 * NO_COLOR または RADIUS_NO_COLOR が設定されている場合、
 * 全関数がカラーコードを付与せずにそのまま返す。
 */

import {
  green as koloristGreen,
  red as koloristRed,
  yellow as koloristYellow,
  blue as koloristBlue,
  cyan as koloristCyan,
  dim as koloristDim,
} from "kolorist";

/**
 * カラー出力が無効化されているか判定する。
 * NO_COLOR または RADIUS_NO_COLOR が設定されている場合に無効化される。
 * FORCE_COLOR が設定されている場合は、TTYでなくても有効化される。
 */
function isColorDisabled(): boolean {
  // FORCE_COLOR が設定されている場合は強制有効化
  if (process.env.FORCE_COLOR) {
    return false;
  }

  // NO_COLOR が設定されている場合は無効化
  if (process.env.NO_COLOR || process.env.RADIUS_NO_COLOR) {
    return true;
  }

  // TTYでない場合は無効化
  return !process.stdout.isTTY;
}

/**
 * 追加行（緑）。行全体を着色する。
 */
export function added(line: string): string {
  if (isColorDisabled()) return line;
  return koloristGreen(line);
}

/**
 * 削除行（赤）。行全体を着色する。
 */
export function removed(line: string): string {
  if (isColorDisabled()) return line;
  return koloristRed(line);
}

/**
 * 変更対象マーカー行（黄）。行全体を着色する。
 */
export function marker(line: string): string {
  if (isColorDisabled()) return line;
  return koloristYellow(line);
}

/**
 * 診断行の着色。severity に応じた色を適用する。
 */
export function diagnostic(
  line: string,
  severity: "error" | "warning" | "info" | "hint"
): string {
  if (isColorDisabled()) return line;

  switch (severity) {
    case "error":
      return koloristRed(line);
    case "warning":
      return koloristYellow(line);
    case "info":
      return koloristBlue(line);
    case "hint":
      return koloristDim(line);
    default:
      return line;
  }
}

/**
 * 警告メッセージ（黄）。
 */
export function warning(line: string): string {
  if (isColorDisabled()) return line;
  return koloristYellow(line);
}

/**
 * ファイルパス（シアン）。
 */
export function filepath(line: string): string {
  if (isColorDisabled()) return line;
  return koloristCyan(line);
}

/**
 * 薄い色（灰）。区切り線やメタ情報に使用。
 */
export function muted(line: string): string {
  if (isColorDisabled()) return line;
  return koloristDim(line);
}
