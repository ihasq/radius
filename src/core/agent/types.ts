/**
 * Phase 16: マルチエージェント同時編集
 *
 * エージェント・コンフリクト型定義。
 */

/** 変更台帳のエントリ */
export interface LedgerEntry {
  /** 一意ID（タイムスタンプ + ランダム） */
  id: string;
  /** 変更を行ったタグチェーンID */
  chainId: string;
  /** 変更対象ファイルの絶対パス */
  filePath: string;
  /** ISO 8601 */
  timestamp: string;
  /** 実行コマンド名 */
  command: string;
  /** 変更された行範囲（1-indexed, inclusive） */
  startLine: number;
  endLine: number;
  /** 変更後の行数（挿入/削除で行数が変わった場合） */
  newEndLine: number;
  /** Changeset ID（HistoryTracker連携） */
  changesetId: string | null;
}

/** コンフリクト */
export interface Conflict {
  /** コンフリクトID */
  id: string;
  status: "pending" | "resolved";
  /** コンフリクトを引き起こした側（後から書いた方） */
  initiator: {
    chainId: string;
    ledgerEntryId: string;
    reason: string;
  };
  /** コンフリクトの被害側（先に書いた方） */
  affected: {
    chainId: string;
    ledgerEntryId: string;
  };
  filePath: string;
  /** 重複した行範囲 */
  overlapStartLine: number;
  overlapEndLine: number;
  /** 解決履歴 */
  challenges: ChallengeEntry[];
  /** 最終解決者（accept した側のチェーンID） */
  resolvedBy?: string;
}

/** Challenge履歴エントリ */
export interface ChallengeEntry {
  /** challenge を送ったチェーンID */
  from: string;
  /** challenge の宛先チェーンID */
  to: string;
  /** challenge の理由 */
  reason: string;
  /** ISO 8601 */
  timestamp: string;
}

/** 通知キューのエントリ */
export interface PendingNotification {
  /** 通知先チェーンID */
  targetChain: string;
  /** コンフリクトID */
  conflictId: string;
  /** 通知タイプ */
  type: "overwrite" | "challenge";
  /** 通知メッセージ */
  message: string;
  /** 通知生成時刻 */
  timestamp: string;
}

/** コンフリクト検査結果 */
export interface ConflictCheck {
  /** 重複するエントリ */
  overlaps: LedgerEntry[];
  /** エラーメッセージ */
  message: string;
  /** 重複箇所の現在の内容 */
  overlapContent?: string;
}
