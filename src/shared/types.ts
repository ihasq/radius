/**
 * CLI → Daemon へ送信するリクエストの型。
 * 全てのコマンドはこの型を経由する。
 */
export interface IpcRequest {
  /** コマンド識別子。例: "ping", "read-var", "modify-var" */
  command: string;
  /** コマンド固有の引数。構造はコマンドごとに異なる。 */
  args: Record<string, unknown>;
}

/**
 * Daemon → CLI へ返すレスポンスの型。
 */
export interface IpcResponse {
  /** リクエスト成否。 */
  ok: boolean;
  /** 正常時の返却データ。 */
  data?: unknown;
  /** 異常時のエラーメッセージ。 */
  error?: string;
}
