/**
 * VSCode env API スタブ
 *
 * 環境情報を提供する。
 */

/**
 * シェルパス
 */
export const shell: string = process.env.SHELL || "/bin/bash";

/**
 * マシンID（固定値）
 */
export const machineId: string = "radius-stub-machine";

/**
 * セッションID（固定値）
 */
export const sessionId: string = "radius-stub-session";

/**
 * アプリケーション名
 */
export const appName: string = "Radius";

/**
 * アプリケーションルート
 */
export const appRoot: string = process.cwd();

/**
 * 言語
 */
export const language: string = "en";

/**
 * リモートかどうか
 */
export const remoteName: string | undefined = undefined;

/**
 * UIKind（CLI）
 */
export const uiKind: number = 2; // UIKind.Desktop = 1, UIKind.Web = 2

/**
 * クリップボード API（no-op）
 */
export const clipboard = {
  readText: (): Promise<string> => Promise.resolve(""),
  writeText: (value: string): Promise<void> => Promise.resolve(),
};

/**
 * URI を開く（no-op）
 */
export function openExternal(target: any): Promise<boolean> {
  return Promise.resolve(true);
}

/**
 * ホスト名
 */
export const hostname: string = require("os").hostname();
