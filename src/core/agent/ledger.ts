/**
 * Phase 16: 変更台帳（Change Ledger）
 * Hotfix: タグチェーンベースのエージェント識別
 *
 * 全チェーンのファイル変更を時系列で記録する。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { projectHash } from "../../shared/paths";
import type { LedgerEntry } from "./types";

const MAX_ENTRIES = 1000;
const DEFAULT_TIME_WINDOW_MINUTES = 30;

export class ChangeLedger {
  private ledgerPath: string = "";
  private entries: LedgerEntry[] = [];
  private initialized = false;

  constructor(private projectRoot: string) {}

  /** 初期化（非同期） */
  private async init(): Promise<void> {
    if (this.initialized) return;

    const hash = await projectHash(this.projectRoot);
    const radiusHome = require("os").homedir();
    const projectDir = join(radiusHome, ".radius", hash);
    this.ledgerPath = join(projectDir, "ledger.json");

    mkdirSync(projectDir, { recursive: true });

    this.load();
    this.initialized = true;
  }

  /**
   * 変更を記録する。
   */
  async record(entry: Omit<LedgerEntry, "id">): Promise<LedgerEntry> {
    await this.init();

    const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    const fullEntry: LedgerEntry = {
      id,
      ...entry,
    };

    this.entries.push(fullEntry);

    // 上限を超えたら古いものから削除
    if (this.entries.length > MAX_ENTRIES) {
      const excessCount = this.entries.length - MAX_ENTRIES;
      this.entries.splice(0, excessCount);
    }

    this.save();
    return fullEntry;
  }

  /**
   * 指定ファイルの指定行範囲と重複する、他チェーンの変更を検索する。
   * 直近 N 分以内の変更のみ対象とする。
   */
  async findOverlaps(
    filePath: string,
    startLine: number,
    endLine: number,
    excludeChain: string,
    withinMinutes: number = DEFAULT_TIME_WINDOW_MINUTES
  ): Promise<LedgerEntry[]> {
    await this.init();

    const cutoffTime = Date.now() - withinMinutes * 60 * 1000;
    const overlaps: LedgerEntry[] = [];

    for (const entry of this.entries) {
      // 時間範囲チェック
      const entryTime = new Date(entry.timestamp).getTime();
      if (entryTime < cutoffTime) continue;

      // ファイルパスチェック
      if (entry.filePath !== filePath) continue;

      // 同一チェーン除外
      if (entry.chainId === excludeChain) continue;

      // 行範囲重複チェック
      if (this.rangesOverlap(startLine, endLine, entry.startLine, entry.newEndLine)) {
        overlaps.push(entry);
      }
    }

    // 新しい順にソート
    return overlaps.sort((a, b) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }

  /**
   * 指定ファイルの直近変更（エージェント問わず）を返す。
   */
  async getRecentChanges(
    filePath: string,
    withinMinutes: number = DEFAULT_TIME_WINDOW_MINUTES
  ): Promise<LedgerEntry[]> {
    await this.init();

    const cutoffTime = Date.now() - withinMinutes * 60 * 1000;
    const changes: LedgerEntry[] = [];

    for (const entry of this.entries) {
      const entryTime = new Date(entry.timestamp).getTime();
      if (entryTime < cutoffTime) continue;

      if (entry.filePath === filePath) {
        changes.push(entry);
      }
    }

    // 新しい順にソート
    return changes.sort((a, b) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }

  /**
   * 行範囲が重複するかチェックする。
   */
  private rangesOverlap(
    startA: number,
    endA: number,
    startB: number,
    endB: number
  ): boolean {
    return startA <= endB && startB <= endA;
  }

  /** 永続化 */
  save(): void {
    if (!this.ledgerPath) return;

    try {
      const dir = dirname(this.ledgerPath);
      mkdirSync(dir, { recursive: true });
      writeFileSync(this.ledgerPath, JSON.stringify(this.entries, null, 2), "utf-8");
    } catch (err) {
      console.error(`[ledger] Failed to save: ${err}`);
    }
  }

  /** ディスクから復元 */
  load(): void {
    if (!this.ledgerPath || !existsSync(this.ledgerPath)) {
      this.entries = [];
      return;
    }

    try {
      const content = readFileSync(this.ledgerPath, "utf-8");
      this.entries = JSON.parse(content);
    } catch (err) {
      console.error(`[ledger] Failed to load: ${err}. Starting fresh.`);
      this.entries = [];
    }
  }

  /**
   * エントリIDでエントリを取得する。
   */
  async getEntry(entryId: string): Promise<LedgerEntry | undefined> {
    await this.init();
    return this.entries.find((e) => e.id === entryId);
  }

  /**
   * 指定時間範囲内に最近の活動があるかチェックする。
   */
  async hasRecentActivity(withinMinutes: number = DEFAULT_TIME_WINDOW_MINUTES): Promise<boolean> {
    await this.init();

    const cutoffTime = Date.now() - withinMinutes * 60 * 1000;

    for (const entry of this.entries) {
      const entryTime = new Date(entry.timestamp).getTime();
      if (entryTime >= cutoffTime) {
        return true;
      }
    }

    return false;
  }
}
