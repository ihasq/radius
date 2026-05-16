/** 単一ファイルに対する変更の記録。 */
export interface FileChange {
  /** ファイルの絶対パス。 */
  filePath: string;
  /** 変更前の全文。 undo 時にこの内容でファイルを復元する。 */
  before: string;
  /** 変更後の全文。 redo 時にこの内容でファイルを復元する。 */
  after: string;
}

/** 単一操作で生じた全変更をまとめたもの。 */
export interface Changeset {
  /** 一意識別子。タイムスタンプベースまたは連番。 */
  id: string;
  /** 操作のタイムスタンプ（ISO 8601）。 */
  timestamp: string;
  /** 実行されたコマンド名。例: "modify-var" */
  command: string;
  /** コマンド引数のサマリ。例: "userName → displayName" */
  description: string;
  /** この操作で変更された全ファイルの記録。 */
  changes: FileChange[];
}
