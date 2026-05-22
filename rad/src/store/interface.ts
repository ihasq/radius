import type { Operation } from '../types';

export interface RadStore {
  /** 単一操作を保存する */
  putOp(op: Operation): Promise<void>;

  /** 複数操作をバッチで保存する（低速ストレージ最適化） */
  putOpBatch(ops: Operation[]): Promise<void>;

  /** 領域の操作一覧を timestamp 順で取得する */
  getOps(regionId: string): Promise<Operation[]>;

  /** 全操作を timestamp 順で取得する */
  getAllOps(): Promise<Operation[]>;

  /** ファイルスナップショットを保存する */
  putSnapshot(filePath: string, content: string): Promise<void>;

  /** ファイルスナップショットを取得する */
  getSnapshot(filePath: string): Promise<string | null>;

  /** 全スナップショットのファイルパス一覧を取得する */
  getSnapshotList(): Promise<string[]>;

  /** 操作ログからスナップショットを再構築し、適用済みログを削除する */
  compact(): Promise<void>;

  /** 全操作ログを削除する（compact 内部で使用） */
  clearOps(): Promise<void>;
}
