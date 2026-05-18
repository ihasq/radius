/**
 * 診断追跡レジストリ
 *
 * ファイル単位の診断状態をメモリとディスクで管理する。
 * 診断にIDを付与し、変更前後の差分を検出する。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import type { LspDiagnostic } from "./types";

export interface TrackedDiagnostic {
  id: string;            // "D-001" 形式
  severity: number;      // 1=Error, 2=Warning, 3=Info, 4=Hint
  code: string;          // LSP診断コード（文字列化）
  message: string;       // 診断メッセージ全文
  line: number;          // 最後に確認された行番号（表示用、マッチングには不使用）
}

export interface DiagnosticDiff {
  /** 変更後も残存している診断（ID付き） */
  active: TrackedDiagnostic[];
  /** 変更によって新出した診断（新ID付与済み） */
  added: TrackedDiagnostic[];
  /** 変更によって消滅した診断 */
  resolved: TrackedDiagnostic[];
}

interface RegistryData {
  nextId: number;
  files: Record<string, TrackedDiagnostic[]>;
}

/**
 * 診断レジストリ
 */
export class DiagnosticRegistry {
  private registryPath: string;
  private data: RegistryData;
  private dirty: boolean = false;

  constructor(projectRoot: string) {
    // プロジェクトルートのハッシュを計算
    const hash = createHash("sha256").update(projectRoot).digest("hex").substring(0, 16);
    const radiusHome = process.env.RADIUS_HOME || join(process.env.HOME || "~", ".radius");
    const projectDir = join(radiusHome, hash);

    this.registryPath = join(projectDir, "diagnostics.json");
    this.data = { nextId: 1, files: {} };
  }

  /**
   * ディスクからレジストリを復元する。
   * ファイルが存在しなければ空の状態で初期化する。
   */
  load(): void {
    if (!existsSync(this.registryPath)) {
      this.data = { nextId: 1, files: {} };
      return;
    }

    try {
      const content = readFileSync(this.registryPath, "utf-8");
      this.data = JSON.parse(content);
    } catch {
      this.data = { nextId: 1, files: {} };
    }
  }

  /**
   * レジストリをディスクに永続化する。
   * dirty フラグが false の場合は何もしない。
   */
  save(): void {
    if (!this.dirty) {
      return;
    }
    const dir = dirname(this.registryPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(this.registryPath, JSON.stringify(this.data, null, 2), "utf-8");
    this.dirty = false;
  }

  /**
   * LSPから取得した最新の診断リストとレジストリを突合し、
   * ID付与・差分検出を行う。
   *
   * レジストリの状態は更新される（新診断にID付与、消滅診断を除去）。
   * save() は呼び出し元の責務。
   *
   * @param filePath 対象ファイルの絶対パス
   * @param currentDiagnostics LSPから取得した最新の診断リスト
   * @returns 差分情報
   */
  update(filePath: string, currentDiagnostics: LspDiagnostic[]): DiagnosticDiff {
    const oldEntries = this.data.files[filePath] || [];
    const active: TrackedDiagnostic[] = [];
    const added: TrackedDiagnostic[] = [];
    const matchedOldIds = new Set<string>();

    // マッチング: currentDiagnostics を順次処理
    for (const diag of currentDiagnostics) {
      const code = String(diag.code || "");
      const message = diag.message;
      const line = diag.range.start.line + 1; // 1-indexed

      // 旧エントリから code + message が一致するものを検索
      const matched = oldEntries.find(
        (old) => old.code === code && old.message === message && !matchedOldIds.has(old.id)
      );

      if (matched) {
        // 既存診断 → active に追加（IDを継承、lineを更新）
        active.push({
          id: matched.id,
          severity: diag.severity || 1,
          code,
          message,
          line,
        });
        matchedOldIds.add(matched.id);
      } else {
        // 新出診断 → added に追加（新ID付与）
        const newId = formatId(this.data.nextId);
        this.data.nextId++;
        added.push({
          id: newId,
          severity: diag.severity || 1,
          code,
          message,
          line,
        });
      }
    }

    // 解消検知: 旧エントリのうち、マッチしなかったもの → resolved
    const resolved = oldEntries.filter((old) => !matchedOldIds.has(old.id));

    // レジストリ更新
    this.data.files[filePath] = [...active, ...added];

    // 変更があった場合のみ dirty フラグを立てる
    if (added.length > 0 || resolved.length > 0) {
      this.dirty = true;
    }

    return { active, added, resolved };
  }

  /**
   * 指定ファイルの現在の診断一覧を返す。
   */
  getForFile(filePath: string): TrackedDiagnostic[] {
    return this.data.files[filePath] || [];
  }
}

/**
 * ID形式: D-001, D-042, D-999
 */
function formatId(n: number): string {
  return `D-${String(n).padStart(3, "0")}`;
}
