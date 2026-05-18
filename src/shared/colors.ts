/**
 * ANSI エスケープコードを使用した行単位のカラーリングユーティリティ。
 *
 * NO_COLOR または RADIUS_NO_COLOR が設定されている場合、
 * 全関数がカラーコードを付与せずにそのまま返す。
 */

// ANSI カラーコード
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";

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
  return `${GREEN}${line}${RESET}`;
}

/**
 * 削除行（赤）。行全体を着色する。
 */
export function removed(line: string): string {
  if (isColorDisabled()) return line;
  return `${RED}${line}${RESET}`;
}

/**
 * 変更対象マーカー行（黄）。行全体を着色する。
 */
export function marker(line: string): string {
  if (isColorDisabled()) return line;
  return `${YELLOW}${line}${RESET}`;
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
      return `${RED}${line}${RESET}`;
    case "warning":
      return `${YELLOW}${line}${RESET}`;
    case "info":
      return `${BLUE}${line}${RESET}`;
    case "hint":
      return `${DIM}${line}${RESET}`;
    default:
      return line;
  }
}

/**
 * 警告メッセージ（黄）。
 */
export function warning(line: string): string {
  if (isColorDisabled()) return line;
  return `${YELLOW}${line}${RESET}`;
}

/**
 * ファイルパス（シアン）。
 */
export function filepath(line: string): string {
  if (isColorDisabled()) return line;
  return `${CYAN}${line}${RESET}`;
}

/**
 * 薄い色（灰）。区切り線やメタ情報に使用。
 */
export function muted(line: string): string {
  if (isColorDisabled()) return line;
  return `${DIM}${line}${RESET}`;
}
