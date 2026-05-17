/**
 * Phase 16: コンフリクトマネージャー
 * Hotfix: タグチェーンベースのエージェント識別
 *
 * 書き込み前のコンフリクト検知と解決プロトコルを管理する。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { projectHash } from "../../shared/paths";
import type { Conflict, PendingNotification, ConflictCheck, LedgerEntry, ChallengeEntry } from "./types";
import type { ChangeLedger } from "./ledger";

export class ConflictManager {
  private conflictsPath: string = "";
  private notificationsPath: string = "";
  private conflicts: Map<string, Conflict> = new Map();
  private notifications: PendingNotification[] = [];
  private initialized = false;

  constructor(
    private projectRoot: string,
    private ledger: ChangeLedger
  ) {}

  /** 初期化（非同期） */
  private async init(): Promise<void> {
    if (this.initialized) return;

    const hash = await projectHash(this.projectRoot);
    const radiusHome = require("os").homedir();
    const projectDir = join(radiusHome, ".radius", hash);
    this.conflictsPath = join(projectDir, "conflicts.json");
    this.notificationsPath = join(projectDir, "notifications.json");

    mkdirSync(projectDir, { recursive: true });

    this.load();
    this.initialized = true;
  }

  /**
   * 書き込み前のコンフリクト検査。
   * 重複があれば ConflictCheck を返し、なければ null を返す。
   */
  async checkBeforeWrite(
    chainId: string,
    filePath: string,
    startLine: number,
    endLine: number,
    newEndLine: number,
    withinMinutes: number = 30
  ): Promise<ConflictCheck | null> {
    await this.init();

    const overlaps = await this.ledger.findOverlaps(
      filePath,
      startLine,
      endLine,
      chainId,
      withinMinutes
    );

    if (overlaps.length === 0) {
      return null;
    }

    // 重複箇所の内容を取得（最新のエントリから）
    const latestOverlap = overlaps[0];
    let overlapContent: string | undefined;

    try {
      if (existsSync(filePath)) {
        const lines = readFileSync(filePath, "utf-8").split("\n");
        const overlapStart = Math.max(0, startLine - 1);
        const overlapEnd = Math.min(lines.length, endLine);
        overlapContent = lines.slice(overlapStart, overlapEnd).join("\n");
      }
    } catch (err) {
      // ファイル読み取り失敗時は内容なしで続行
      overlapContent = undefined;
    }

    const chainIds = Array.from(new Set(overlaps.map((o) => o.chainId)));
    const message = `conflict detected: ${chainIds.length} other chain(s) modified lines ${startLine}-${endLine} in the last ${withinMinutes} minutes (chains: ${chainIds.join(", ")})`;

    return {
      overlaps,
      message,
      overlapContent,
    };
  }

  /**
   * コンフリクトを記録し、上書きした側（initiator）と影響を受けた側（affected）を記録する。
   * 上書きされた側のチェーンに通知を追加する。
   */
  async recordOverwrite(
    initiatorChainId: string,
    initiatorLedgerEntryId: string,
    affectedLedgerEntryId: string,
    filePath: string,
    overlapStartLine: number,
    overlapEndLine: number,
    reason: string
  ): Promise<Conflict> {
    await this.init();

    // affected チェーンIDを取得
    const affectedEntry = await this.ledger.getEntry(affectedLedgerEntryId);
    if (!affectedEntry) {
      throw new Error(`ledger entry not found: ${affectedLedgerEntryId}`);
    }

    const conflictId = `conflict-${Date.now()}-${randomBytes(4).toString("hex")}`;

    const conflict: Conflict = {
      id: conflictId,
      status: "pending",
      initiator: {
        chainId: initiatorChainId,
        ledgerEntryId: initiatorLedgerEntryId,
        reason,
      },
      affected: {
        chainId: affectedEntry.chainId,
        ledgerEntryId: affectedLedgerEntryId,
      },
      filePath,
      overlapStartLine,
      overlapEndLine,
      challenges: [],
    };

    this.conflicts.set(conflictId, conflict);

    // 影響を受けた側に通知を追加
    this.notifications.push({
      targetChain: affectedEntry.chainId,
      conflictId,
      type: "overwrite",
      message: `your changes to ${filePath}:${overlapStartLine}-${overlapEndLine} were overwritten by chain ${initiatorChainId}. reason: ${reason}`,
      timestamp: new Date().toISOString(),
    });

    this.save();
    return conflict;
  }

  /**
   * 指定チェーン宛ての未読通知を取得する。
   */
  async getPendingNotifications(chainId: string): Promise<PendingNotification[]> {
    await this.init();
    return this.notifications.filter((n) => n.targetChain === chainId);
  }

  /**
   * コンフリクトを受け入れる（accept）。
   * 受け入れたチェーンが記録され、コンフリクトは resolved になる。
   * 該当通知を削除する。
   */
  async acceptConflict(conflictId: string, chainId: string): Promise<Conflict | null> {
    await this.init();

    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      return null;
    }

    // affected 側のみが accept できる
    if (conflict.affected.chainId !== chainId) {
      throw new Error(`only affected chain (${conflict.affected.chainId}) can accept this conflict`);
    }

    conflict.status = "resolved";
    conflict.resolvedBy = chainId;

    // 該当通知を削除
    this.notifications = this.notifications.filter(
      (n) => n.conflictId !== conflictId || n.targetChain !== chainId
    );

    this.save();
    return conflict;
  }

  /**
   * コンフリクトに challenge を送る。
   * challenge を送った側のチェーンに、相手側チェーン宛ての通知を追加する。
   * 修正4: challenge が5回を超えた場合は強制 resolved。
   */
  async challengeConflict(
    conflictId: string,
    chainId: string,
    reason: string
  ): Promise<Conflict | null> {
    await this.init();

    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      return null;
    }

    // affected 側のみが challenge できる
    if (conflict.affected.chainId !== chainId) {
      throw new Error(`only affected chain (${conflict.affected.chainId}) can challenge this conflict`);
    }

    // 修正4: challenge 上限チェック
    if (conflict.challenges.length >= 5) {
      conflict.status = "resolved";
      conflict.resolvedBy = "system:max-challenges";
      this.save();
      return conflict;
    }

    const challengeEntry: ChallengeEntry = {
      from: chainId,
      to: conflict.initiator.chainId,
      reason,
      timestamp: new Date().toISOString(),
    };

    conflict.challenges.push(challengeEntry);

    // initiator に通知を追加
    this.notifications.push({
      targetChain: conflict.initiator.chainId,
      conflictId,
      type: "challenge",
      message: `chain ${chainId} challenges your overwrite of ${conflict.filePath}:${conflict.overlapStartLine}-${conflict.overlapEndLine}. reason: ${reason}`,
      timestamp: new Date().toISOString(),
    });

    this.save();
    return conflict;
  }

  /**
   * 指定チェーンの通知をクリアする。
   */
  async clearNotifications(chainId: string): Promise<void> {
    await this.init();
    this.notifications = this.notifications.filter((n) => n.targetChain !== chainId);
    this.save();
  }

  /**
   * コンフリクトを取得する。
   */
  async getConflict(conflictId: string): Promise<Conflict | undefined> {
    await this.init();
    return this.conflicts.get(conflictId);
  }

  /**
   * 全コンフリクトを取得する。
   */
  async getAllConflicts(): Promise<Conflict[]> {
    await this.init();
    return Array.from(this.conflicts.values());
  }

  /** 永続化 */
  save(): void {
    if (!this.conflictsPath || !this.notificationsPath) return;

    try {
      const conflictsDir = dirname(this.conflictsPath);
      mkdirSync(conflictsDir, { recursive: true });

      const conflictsArray = Array.from(this.conflicts.values());
      writeFileSync(this.conflictsPath, JSON.stringify(conflictsArray, null, 2), "utf-8");
      writeFileSync(this.notificationsPath, JSON.stringify(this.notifications, null, 2), "utf-8");
    } catch (err) {
      console.error(`[conflict] Failed to save: ${err}`);
    }
  }

  /** ディスクから復元 */
  load(): void {
    // conflicts.json から復元
    if (this.conflictsPath && existsSync(this.conflictsPath)) {
      try {
        const content = readFileSync(this.conflictsPath, "utf-8");
        const conflictsArray: Conflict[] = JSON.parse(content);
        this.conflicts = new Map(conflictsArray.map((c) => [c.id, c]));
      } catch (err) {
        console.error(`[conflict] Failed to load conflicts: ${err}. Starting fresh.`);
        this.conflicts = new Map();
      }
    }

    // notifications.json から復元
    if (this.notificationsPath && existsSync(this.notificationsPath)) {
      try {
        const content = readFileSync(this.notificationsPath, "utf-8");
        this.notifications = JSON.parse(content);
      } catch (err) {
        console.error(`[conflict] Failed to load notifications: ${err}. Starting fresh.`);
        this.notifications = [];
      }
    }
  }
}
