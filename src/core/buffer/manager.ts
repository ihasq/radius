/**
 * Piece Tree テキストバッファマネージャ。
 *
 * ファイルごとのPieceTreeインスタンスを管理し、
 * ディスクI/Oの代わりにメモリ上で効率的なテキスト編集を実現する。
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import {
  PieceTreeTextBufferBuilder,
  PieceTreeBase,
} from "vscode-textbuffer";

/** Phase 10 Part B: LRUキャッシュの上限 */
const MAX_OPEN_BUFFERS = 50;

/** バッファエントリ（Phase 10 Part A: mtime追跡） */
interface BufferEntry {
  buffer: PieceTreeBase;
  /** バッファ構築時のディスクファイルmtime（ms精度） */
  mtimeMs: number;
  /** 最終flush時刻。flushしていなければバッファ構築時刻。 */
  lastFlushMs: number;
  /** 未flushの変更があるか（Phase 10 Part B: LRU用） */
  dirty: boolean;
}

/**
 * バッファマネージャ。
 * デーモンのライフサイクルと同期し、ファイルのバッファを管理する。
 */
export class BufferManager {
  /** ファイルパス → BufferEntry のマップ */
  private buffers = new Map<string, BufferEntry>();

  /**
   * ファイルのバッファを取得する。
   * 未ロードの場合はディスクから読み込んでPieceTreeを構築する。
   * Phase 10 Part A: 外部変更を検知してバッファを再構築する。
   * Phase 10 Part B: LRUキャッシュで上限を管理する。
   */
  open(filePath: string): PieceTreeBase {
    const entry = this.buffers.get(filePath);

    if (entry) {
      // 既存バッファあり
      // Phase 10 Part B: LRU更新（末尾に移動）
      this.buffers.delete(filePath);
      this.buffers.set(filePath, entry);

      // dirty な場合は mtime チェックをスキップして既存バッファを返す
      if (entry.dirty) {
        return entry.buffer;
      }

      // dirty でない場合のみ mtime チェック
      // ただし、ファイルが存在しない場合はチェックをスキップ
      if (existsSync(filePath)) {
        try {
          const diskMtime = statSync(filePath).mtimeMs;
          if (diskMtime > entry.lastFlushMs) {
            // 外部変更を検知。バッファを再構築する。
            console.log(`[buffer] external change detected: ${filePath}`);
            this.buffers.delete(filePath);
            // 新規バッファ構築へフォールスルー
          } else {
            return entry.buffer;
          }
        } catch (err) {
          // statSync に失敗した場合（まれ）
          return entry.buffer;
        }
      } else {
        // ファイルが存在しない → 新規作成中の可能性があるので既存バッファを返す
        return entry.buffer;
      }
    }

    // Phase 10 Part B: LRUキャッシュ上限チェック
    if (this.buffers.size >= MAX_OPEN_BUFFERS) {
      // 最も古いエントリ（Map先頭）を除去
      const oldestPath = this.buffers.keys().next().value as string;
      const oldestEntry = this.buffers.get(oldestPath);

      if (oldestEntry) {
        if (oldestEntry.dirty) {
          // 未flushの変更がある場合は自動flush
          console.log(`[buffer] evicting: ${oldestPath} (dirty: true)`);
          const content = this.getContentFromBuffer(oldestEntry.buffer);
          writeFileSync(oldestPath, content, "utf-8");
        } else {
          console.log(`[buffer] evicting: ${oldestPath} (dirty: false)`);
        }
        this.buffers.delete(oldestPath);
      }
    }

    // 新規バッファ構築
    let content = "";
    let mtimeMs = Date.now();

    if (existsSync(filePath)) {
      content = readFileSync(filePath, "utf-8");
      mtimeMs = statSync(filePath).mtimeMs;
    }

    // PieceTree構築
    const builder = new PieceTreeTextBufferBuilder();
    builder.acceptChunk(content);
    const factory = builder.finish(true);
    const buffer = factory.create(1); // DefaultEndOfLine.LF = 1

    this.buffers.set(filePath, {
      buffer,
      mtimeMs,
      lastFlushMs: mtimeMs,
      dirty: false,
    });

    return buffer;
  }

  /**
   * バッファの内容をディスクにフラッシュする。
   * Phase 10 Part A: lastFlushMs を更新する。
   */
  flush(filePath: string): void {
    const entry = this.buffers.get(filePath);
    if (!entry) {
      throw new Error(`Buffer not found: ${filePath}`);
    }

    const content = this.getContent(filePath);
    writeFileSync(filePath, content, "utf-8");

    // Phase 10 Part A: flush後にlastFlushMsを更新
    entry.lastFlushMs = Date.now();
    entry.dirty = false;
  }

  /**
   * バッファを閉じてメモリから解放する。
   */
  close(filePath: string): void {
    this.buffers.delete(filePath);
  }

  /**
   * 指定行の内容を返す（1-indexed）。
   */
  getLineContent(filePath: string, lineNumber: number): string {
    const buffer = this.open(filePath);
    return buffer.getLineContent(lineNumber);
  }

  /**
   * 指定範囲の行を返す（1-indexed, inclusive）。
   */
  getLineRange(
    filePath: string,
    startLine: number,
    endLine: number
  ): string[] {
    const buffer = this.open(filePath);
    const lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      lines.push(buffer.getLineContent(i));
    }
    return lines;
  }

  /**
   * 総行数を返す。
   */
  getLineCount(filePath: string): number {
    const buffer = this.open(filePath);
    return buffer.getLineCount();
  }

  /**
   * オフセット位置に文字列を挿入する。
   * Phase 10 Part A/B: dirty フラグを立てる。
   */
  insert(filePath: string, offset: number, text: string): void {
    const buffer = this.open(filePath);
    buffer.insert(offset, text);

    const entry = this.buffers.get(filePath);
    if (entry) {
      entry.dirty = true;
    }
  }

  /**
   * オフセット位置から指定長の文字列を削除する。
   * Phase 10 Part A/B: dirty フラグを立てる。
   */
  delete(filePath: string, offset: number, length: number): void {
    const buffer = this.open(filePath);
    buffer.delete(offset, length);

    const entry = this.buffers.get(filePath);
    if (entry) {
      entry.dirty = true;
    }
  }

  /**
   * バッファの全内容を文字列として返す。
   */
  getContent(filePath: string): string {
    const buffer = this.open(filePath);
    return this.getContentFromBuffer(buffer);
  }

  /**
   * バッファの内容を完全に置換する。
   */
  setContent(filePath: string, content: string): void {
    const buffer = this.open(filePath);
    const currentContent = this.getContentFromBuffer(buffer);

    // 全削除して全挿入
    buffer.delete(0, currentContent.length);
    buffer.insert(0, content);

    const entry = this.buffers.get(filePath);
    if (entry) {
      entry.dirty = true;
    }
  }

  /**
   * PieceTreeBaseから直接内容を取得する（内部ヘルパー）。
   */
  private getContentFromBuffer(buffer: PieceTreeBase): string {
    const lineCount = buffer.getLineCount();
    const lines: string[] = [];
    for (let i = 1; i <= lineCount; i++) {
      lines.push(buffer.getLineContent(i));
    }
    return lines.join("\n");
  }

  /**
   * 行番号からオフセットを計算する（1-indexed）。
   * 指定行の先頭文字のオフセットを返す。
   */
  getOffsetAt(filePath: string, lineNumber: number, column: number = 1): number {
    const buffer = this.open(filePath);
    return buffer.getOffsetAt(lineNumber, column);
  }

  /**
   * 全バッファをクリアする（デーモン停止時用）。
   */
  closeAll(): void {
    this.buffers.clear();
  }
}
