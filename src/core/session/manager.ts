/**
 * Phase 11: 会話巻き戻り検知（ドッグタグ方式）
 *
 * セッション管理モジュール。
 * タグ検証と自動巻き戻しを実装する。
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { projectHash } from "../../shared/paths";
import type { HistoryTracker } from "../history/tracker";
import type { LspManager } from "../../lsp/manager";

/**
 * セッション状態。
 */
interface SessionState {
  /** 現在のシーケンス番号（内部管理用） */
  currentSeq: number;
  /** tag文字列 → seq番号 */
  tagToSeq: Record<string, number>;
  /** seq番号 → tag文字列 */
  seqToTag: Record<number, string>;
  /** seq番号 → Changeset ID（HistoryTracker連携用） */
  seqToChangeset: Record<number, string>;
}

/**
 * タグ生成（ランダム8文字）
 */
function generateTag(projectHashPrefix: string): string {
  const random = randomBytes(6).toString("base64url").slice(0, 8);
  return `${projectHashPrefix}-${random}`;
}

/**
 * セッションマネージャ。
 * プロジェクト単位でタグとシーケンスを管理する。
 */
export class SessionManager {
  private projectRoot: string;
  private projectHash: string;
  private projectHashPrefix: string;
  private sessionPath: string;
  private state: SessionState;
  private initialized: boolean = false;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.projectHash = "";
    this.projectHashPrefix = "";
    this.sessionPath = "";

    // 初期状態
    this.state = {
      currentSeq: 0,
      tagToSeq: {},
      seqToTag: {},
      seqToChangeset: {},
    };
  }

  /** 初期化（非同期）。最初の使用前に呼び出す。 */
  private async init(): Promise<void> {
    if (this.initialized) return;

    // プロジェクトハッシュを生成（HistoryTracker と同じ16文字）
    this.projectHash = await projectHash(this.projectRoot);
    this.projectHashPrefix = this.projectHash.slice(0, 4);

    // セッションファイルのパス: ~/.radius/<project-hash>/session.json
    const homeDir = require("node:os").homedir();
    const radiusDir = join(homeDir, ".radius", this.projectHash);
    this.sessionPath = join(radiusDir, "session.json");

    // ディレクトリ作成
    if (!existsSync(radiusDir)) {
      mkdirSync(radiusDir, { recursive: true });
    }

    this.load();
    this.initialized = true;
  }

  /**
   * 受信タグを検証し、必要に応じて巻き戻しを実行する。
   */
  async validateAndRewind(
    tag: string | null | undefined,
    historyTracker: HistoryTracker,
    lspManager: LspManager,
    isWriteCommand: boolean
  ): Promise<{ warnings: string[]; currentSeq: number; rejected: boolean }> {
    await this.init();
    const warnings: string[] = [];

    // 1. tag が undefined: タグなしで呼び出された
    if (tag === undefined) {
      // セッションが存在しない（初回呼び出し）
      if (this.state.currentSeq === 0) {
        return { warnings, currentSeq: this.state.currentSeq, rejected: false };
      }

      // セッションが存在する
      if (isWriteCommand) {
        // 書き込みコマンド → 拒否
        warnings.push("error: --tag is required. Pass the tag from your previous radius output.");
        return { warnings, currentSeq: this.state.currentSeq, rejected: true };
      } else {
        // 読み取り専用コマンド → 警告付き続行
        warnings.push("warning: --tag not provided.");
        return { warnings, currentSeq: this.state.currentSeq, rejected: false };
      }
    }

    // 2. tag が null: 明示的なセッション初期化リクエスト
    if (tag === null) {
      this.state.currentSeq = 0;
      this.state.tagToSeq = {};
      this.state.seqToTag = {};
      this.state.seqToChangeset = {};
      this.save();
      return { warnings, currentSeq: this.state.currentSeq, rejected: false };
    }

    // 3. tag が tagToSeq に存在しない
    if (!(tag in this.state.tagToSeq)) {
      warnings.push(`warning: unknown tag '${tag}'. Session may be corrupted.`);
      // セッション初期化
      this.state.currentSeq = 0;
      this.state.tagToSeq = {};
      this.state.seqToTag = {};
      this.state.seqToChangeset = {};
      this.save();
      return { warnings, currentSeq: this.state.currentSeq, rejected: false };
    }

    const receivedSeq = this.state.tagToSeq[tag];

    // 4. receivedSeq == currentSeq: 正常
    if (receivedSeq === this.state.currentSeq) {
      return { warnings, currentSeq: this.state.currentSeq, rejected: false };
    }

    // 5. receivedSeq < currentSeq: 巻き戻り検知
    if (receivedSeq < this.state.currentSeq) {
      const undoCount = this.state.currentSeq - receivedSeq;
      const undoDetails: string[] = [];

      // seq = currentSeq から receivedSeq + 1 まで降順に undo
      for (let seq = this.state.currentSeq; seq > receivedSeq; seq--) {
        const changesetId = this.state.seqToChangeset[seq];
        if (changesetId) {
          try {
            // HistoryTracker で undo
            const undoResult = await historyTracker.undo();
            if (undoResult) {
              // 変更されたファイルの didClose を送信
              for (const change of undoResult.changes) {
                const client = await lspManager.getClient(change.filePath, this.projectRoot);
                if (client) {
                  const uri = `file://${change.filePath}`;
                  client.closeDocument(uri);
                }
              }
              undoDetails.push(`  undone: ${undoResult.command} (${undoResult.description}) [seq:${seq}]`);
            }
          } catch (err) {
            // undo 失敗時は中止
            warnings.push(`warning: partial rewind. ${this.state.currentSeq - seq} of ${undoCount} operations undone.`);
            warnings.push(...undoDetails);
            this.state.currentSeq = seq;
            this.save();
            return { warnings, currentSeq: this.state.currentSeq, rejected: false };
          }
        }

        // セッション状態から削除
        delete this.state.seqToChangeset[seq];
        const oldTag = this.state.seqToTag[seq];
        if (oldTag) {
          delete this.state.seqToTag[seq];
          delete this.state.tagToSeq[oldTag];
        }
      }

      this.state.currentSeq = receivedSeq;
      warnings.unshift(`warning: conversation rewind detected. Undoing ${undoCount} operation(s).`);
      warnings.push(...undoDetails);
      this.save();
      return { warnings, currentSeq: this.state.currentSeq, rejected: false };
    }

    // 6. receivedSeq > currentSeq: 理論上発生しない
    warnings.push(`warning: tag from future sequence. Ignoring.`);
    return { warnings, currentSeq: this.state.currentSeq, rejected: false };
  }

  /**
   * ファイル変更を伴うコマンド完了後に呼び出す。
   * シーケンスを進め、新しいタグを生成し、Changeset IDと紐付ける。
   */
  advance(changesetId: string): string {
    // init() は validateAndRewind() で既に呼ばれているはず
    this.state.currentSeq++;
    const newTag = generateTag(this.projectHashPrefix);

    this.state.tagToSeq[newTag] = this.state.currentSeq;
    this.state.seqToTag[this.state.currentSeq] = newTag;
    this.state.seqToChangeset[this.state.currentSeq] = changesetId;

    this.save();
    return newTag;
  }

  /**
   * 読み取り専用コマンド用。シーケンスを進めずに現在のタグを返す。
   */
  currentTag(): string {
    // init() は validateAndRewind() で既に呼ばれているはず
    // currentSeq のタグを返す。存在しない場合は新規生成
    const existing = this.state.seqToTag[this.state.currentSeq];
    if (existing) {
      return existing;
    }

    // 初回の場合、seq:0 のタグを生成
    const newTag = generateTag(this.projectHashPrefix);
    this.state.tagToSeq[newTag] = this.state.currentSeq;
    this.state.seqToTag[this.state.currentSeq] = newTag;
    this.save();
    return newTag;
  }

  /**
   * セッション状態をディスクに永続化する。
   */
  save(): void {
    try {
      const dir = dirname(this.sessionPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.sessionPath, JSON.stringify(this.state, null, 2), "utf-8");
    } catch (err) {
      console.error(`[session] Failed to save session: ${err}`);
    }
  }

  /**
   * ディスクからセッション状態を復元する。
   */
  load(): void {
    if (!existsSync(this.sessionPath)) {
      return;
    }

    try {
      const content = readFileSync(this.sessionPath, "utf-8");
      const loaded = JSON.parse(content);
      this.state = {
        currentSeq: loaded.currentSeq || 0,
        tagToSeq: loaded.tagToSeq || {},
        seqToTag: loaded.seqToTag || {},
        seqToChangeset: loaded.seqToChangeset || {},
      };
    } catch (err) {
      console.error(`[session] Failed to load session: ${err}. Initializing new session.`);
      // 破損している場合は初期化
      this.state = {
        currentSeq: 0,
        tagToSeq: {},
        seqToTag: {},
        seqToChangeset: {},
      };
    }
  }
}
