/**
 * CLI → Daemon へ送信するリクエストの型。
 * 全てのコマンドはこの型を経由する。
 */
export interface IpcRequest {
  /** コマンド識別子。例: "ping", "read-var", "modify-var" */
  command: string;
  /** コマンド固有の引数。構造はコマンドごとに異なる。 */
  args: Record<string, unknown>;
  /** 会話巻き戻り検知用のドッグタグ（任意）。 */
  tag?: string | null;
  /** 現在の作業ディレクトリ（任意）。 */
  cwd?: string;
  /** 標準入力内容（--stdin使用時、任意）。 */
  stdin?: string;
}

/**
 * 書き込みコマンドの変更メタデータ（Phase 16: マルチエージェント台帳記録用）
 */
export interface ChangeMetadata {
  /** 変更されたファイルパス */
  filePath: string;
  /** 変更開始行（1-indexed, inclusive） */
  startLine: number;
  /** 変更終了行（変更前、1-indexed, inclusive） */
  endLine: number;
  /** 変更後の終了行（1-indexed, inclusive） */
  newEndLine: number;
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
  /** 新しいドッグタグ（任意）。 */
  tag?: string;
  /** 初回タグかどうか（first-time note表示用）。 */
  isFirstTag?: boolean;
  /** 巻き戻り警告メッセージ（任意）。 */
  warnings?: string[];
  /** 書き込みコマンドの変更メタデータ（Phase 16、任意）。 */
  changes?: ChangeMetadata[];
}
