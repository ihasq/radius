/**
 * HistoryTracker: Undo/Redo履歴の管理。
 * Hotfix: タグチェーンベースのエージェント識別
 *
 * プロジェクト・チェーン単位で履歴を ~/.radius/<project-hash>/history/<chainId>/ に保存。
 */

import { resolve, dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { projectHash } from "../../shared/paths";
import type { Changeset, FileChange } from "./types";

interface State {
  oldest: number;  // C2: 最古の有効Changeset番号
  pointer: number; // 現在位置（oldest 〜 oldest + total - 1 の範囲）
  total: number;   // 有効Changeset数
}

const MAX_HISTORY = 100;

export class HistoryTracker {
  private historyDir: string;
  private statePath: string;
  private chainId: string;
  // C1: 履歴操作の直列化キュー
  private operationQueue: Promise<any> = Promise.resolve();

  constructor(private projectRoot: string, chainId: string) {
    // 同期的にハッシュを計算する必要があるため、初期化は非同期メソッドで行う
    if (!chainId) {
      throw new Error("[HistoryTracker] constructor called with empty chainId");
    }
    this.chainId = chainId;
    this.historyDir = "";
    this.statePath = "";
  }

  /** 初期化（非同期）。最初の使用前に呼び出す。 */
  private async init(): Promise<void> {
    if (this.historyDir) return; // 既に初期化済み

    const hash = await projectHash(this.projectRoot);
    const radiusHome = resolve(require("os").homedir(), ".radius");
    this.historyDir = resolve(radiusHome, hash, "history", this.chainId);
    this.statePath = resolve(this.historyDir, "state.json");

    // ディレクトリ作成
    mkdirSync(this.historyDir, { recursive: true });

    // state.json の整合性チェック
    if (existsSync(this.statePath)) {
      try {
        const state = this.loadState();
        const files = this.listChangesetFiles();
        let needsSave = false;

        // C2: 旧形式（oldest なし）からの移行
        if (state.oldest === undefined) {
          state.oldest = 1;
          needsSave = true;
        }

        // 不整合があれば修正
        if (state.total !== files.length) {
          console.log(`[history] state.json inconsistency detected, fixing...`);
          state.total = files.length;
          if (state.pointer > state.oldest + state.total - 1) {
            state.pointer = state.oldest + state.total - 1;
          }
          if (state.pointer < state.oldest && state.total > 0) {
            state.pointer = state.oldest;
          }
          needsSave = true;
        }

        if (needsSave) {
          this.saveState(state);
        }
      } catch {
        // state.json が破損している場合は再作成
        this.saveState({ oldest: 1, pointer: 0, total: 0 });
      }
    } else {
      // state.json がなければ作成
      this.saveState({ oldest: 1, pointer: 0, total: 0 });
    }
  }

  /** C1: 操作を直列化する内部ヘルパー */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const promise = this.operationQueue.then(operation, operation);
    this.operationQueue = promise.catch(() => {}); // 次の操作を止めないようエラーを吸収
    return promise;
  }

  /** 新しい Changeset を記録する。 */
  async record(changeset: Changeset): Promise<void> {
    return this.enqueue(async () => {
      await this.init();
    const state = this.loadState();

    // C2: pointer より先の redo 履歴を破棄
    const lastValid = state.oldest + state.total - 1;
    if (state.pointer < lastValid) {
      for (let i = state.pointer + 1; i <= lastValid; i++) {
        const path = this.changesetPath(i);
        if (existsSync(path)) {
          unlinkSync(path);
        }
      }
      // total を pointer の位置まで調整
      state.total = state.pointer - state.oldest + 1;
    }

    // C2: 新しい Changeset 番号を計算（oldest + total）
    const newNumber = state.oldest + state.total;

    // C2: 上限チェック（total が MAX_HISTORY に達している場合は最古を削除）
    if (state.total >= MAX_HISTORY) {
      this.trimHistory(state);
    }

    // 新しい Changeset を追加
    state.total++;
    state.pointer = state.oldest + state.total - 1;

      // 保存
      writeFileSync(this.changesetPath(newNumber), JSON.stringify(changeset, null, 2), "utf-8");
      this.saveState(state);
    });
  }

  /** 直前の操作を取り消す。 */
  async undo(): Promise<Changeset | null> {
    return this.enqueue(async () => {
      await this.init();
    const state = this.loadState();

    // C2: pointer が oldest 未満の場合は undo できない
    if (state.pointer < state.oldest || state.total === 0) {
      return null; // 履歴なし
    }

    // pointer 番の Changeset の before 内容でファイルを書き戻す
    const changeset = this.loadChangeset(state.pointer);
    if (!changeset) {
      return null;
    }

    // B3: ファイル書き戻し（ファイル作成/削除対応）
    for (const change of changeset.changes) {
      try {
        if (change.before === "" && change.after !== "") {
          // undo 時: after が非空、before が空 → ファイルを削除
          if (existsSync(change.filePath)) {
            unlinkSync(change.filePath);
          }
        } else if (change.before !== "" && change.after === "") {
          // undo 時: before が非空、after が空 → ファイルを作成
          const dir = dirname(change.filePath);
          mkdirSync(dir, { recursive: true });
          writeFileSync(change.filePath, change.before, "utf-8");
        } else {
          // 通常の書き戻し
          writeFileSync(change.filePath, change.before, "utf-8");
        }
      } catch (err) {
        console.error(`[history] failed to restore ${change.filePath}:`, err);
      }
    }

      // ポインタをデクリメント
      state.pointer--;
      this.saveState(state);

      return changeset;
    });
  }

  /** 直前の undo を再適用する。 */
  async redo(): Promise<Changeset | null> {
    return this.enqueue(async () => {
      await this.init();
    const state = this.loadState();

    // C2: pointer が最後の有効 Changeset に達している場合は redo できない
    const lastValid = state.oldest + state.total - 1;
    if (state.pointer >= lastValid || state.total === 0) {
      return null; // redo 可能な履歴なし
    }

    // pointer + 1 番の Changeset の after 内容でファイルを書き戻す
    const nextPointer = state.pointer + 1;
    const changeset = this.loadChangeset(nextPointer);
    if (!changeset) {
      return null;
    }

    // B3: ファイル書き戻し（ファイル作成/削除対応）
    for (const change of changeset.changes) {
      try {
        if (change.before === "" && change.after !== "") {
          // redo 時: before が空、after が非空 → ファイルを作成
          const dir = dirname(change.filePath);
          mkdirSync(dir, { recursive: true });
          writeFileSync(change.filePath, change.after, "utf-8");
        } else if (change.before !== "" && change.after === "") {
          // redo 時: before が非空、after が空 → ファイルを削除
          if (existsSync(change.filePath)) {
            unlinkSync(change.filePath);
          }
        } else {
          // 通常の書き戻し
          writeFileSync(change.filePath, change.after, "utf-8");
        }
      } catch (err) {
        console.error(`[history] failed to apply ${change.filePath}:`, err);
      }
    }

      // ポインタをインクリメント
      state.pointer = nextPointer;
      this.saveState(state);

      return changeset;
    });
  }

  /** 直近 N 件の履歴を返す（表示用）。 */
  async list(count: number): Promise<Changeset[]> {
    await this.init();
    const state = this.loadState();
    const result: Changeset[] = [];

    // C2: oldest を考慮した範囲チェック
    const start = Math.max(state.oldest, state.pointer - count + 1);
    for (let i = state.pointer; i >= start && i >= state.oldest; i--) {
      const changeset = this.loadChangeset(i);
      if (changeset) {
        result.push(changeset);
      }
    }

    return result;
  }

  /** 最新の Changeset ID を取得（セッション管理用）。 */
  async getLatestChangesetId(): Promise<string | null> {
    await this.init();

    try {
      const state = this.loadState();
      if (state.pointer < state.oldest || state.total === 0) {
        return null;
      }

      const changeset = this.loadChangeset(state.pointer);
      return changeset ? changeset.id : null;
    } catch {
      return null;
    }
  }

  /** state.json の読み込み */
  private loadState(): State {
    const content = readFileSync(this.statePath, "utf-8");
    return JSON.parse(content) as State;
  }

  /** state.json の保存 */
  private saveState(state: State): void {
    writeFileSync(this.statePath, JSON.stringify(state, null, 2), "utf-8");
  }

  /** Changeset ファイルのパス */
  private changesetPath(num: number): string {
    return resolve(this.historyDir, `${String(num).padStart(4, "0")}.json`);
  }

  /** Changeset の読み込み */
  private loadChangeset(num: number): Changeset | null {
    const path = this.changesetPath(num);
    if (!existsSync(path)) {
      return null;
    }
    try {
      const content = readFileSync(path, "utf-8");
      return JSON.parse(content) as Changeset;
    } catch {
      return null;
    }
  }

  /** 既存の Changeset ファイル一覧 */
  private listChangesetFiles(): string[] {
    if (!existsSync(this.historyDir)) {
      return [];
    }
    return readdirSync(this.historyDir)
      .filter((name) => name.match(/^\d{4}\.json$/))
      .sort();
  }

  /** C2: 履歴の上限を超えた場合に最古の Changeset を削除（番号振り直しなし） */
  private trimHistory(state: State): void {
    // oldest 番のファイルを削除
    const path = this.changesetPath(state.oldest);
    if (existsSync(path)) {
      unlinkSync(path);
    }

    // oldest をインクリメント、total をデクリメント
    state.oldest++;
    state.total--;
  }
}
