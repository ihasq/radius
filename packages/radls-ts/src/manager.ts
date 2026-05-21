/**
 * TsRadManager - Language Service 永続化マネージャ
 *
 * プロジェクトごとに Language Service をキャッシュし、
 * コマンド間で再利用することでディスク I/O を削減する。
 */

import ts from "typescript";
import { createDepth2Host, createDepth3Host } from "./host";

interface CachedService {
  service: ts.LanguageService;
  depth: number;
  projectRoot: string;
  createdAt: number;
  updateFile: (fileName: string, content: string) => void;
}

const MAX_CACHED_SERVICES = 2;

export class TsRadManager {
  private services = new Map<string, CachedService>();

  /**
   * projectRoot に対応する Language Service を取得する。
   * 既にキャッシュ済みで、depth が要求以上であれば再利用する。
   * depth が不足する場合は再作成する。
   */
  getService(projectRoot: string, depth: number, filePath?: string, content?: string): ts.LanguageService {
    const key = projectRoot;
    const cached = this.services.get(key);

    if (cached && cached.depth >= depth) {
      return cached.service;
    }

    // 既存サービスがあれば破棄
    if (cached) {
      cached.service.dispose();
      this.services.delete(key);
    }

    // LRU: 上限到達時に最古を破棄
    if (this.services.size >= MAX_CACHED_SERVICES) {
      let oldestKey = "";
      let oldestTime = Infinity;
      for (const [k, v] of this.services) {
        if (v.createdAt < oldestTime) {
          oldestTime = v.createdAt;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        this.services.get(oldestKey)?.service.dispose();
        this.services.delete(oldestKey);
      }
    }

    // 新規作成
    let host: ts.LanguageServiceHost;
    let updateFile: (fileName: string, content: string) => void;

    if (depth <= 2) {
      const result = createDepth2Host(filePath!, content!, projectRoot);
      host = result.host;
      updateFile = result.updateFile;
    } else {
      const result = createDepth3Host(projectRoot, filePath);
      host = result.host;
      updateFile = result.updateFile;
    }

    const service = ts.createLanguageService(host);
    this.services.set(key, { service, depth, projectRoot, createdAt: Date.now(), updateFile });
    return service;
  }

  /**
   * ファイル変更を Language Service に通知する。
   * BufferManager からファイルが flush された時に呼ばれる。
   */
  notifyFileChange(projectRoot: string, filePath: string, content: string): void {
    const cached = this.services.get(projectRoot);
    if (cached) {
      console.log(`[TsRadManager] notifyFileChange: ${filePath} (${content.length} bytes)`);
      cached.updateFile(filePath, content);
    } else {
      console.log(`[TsRadManager] notifyFileChange: no cached service for ${projectRoot}`);
    }
  }

  /**
   * 全サービスを破棄する（デーモン shutdown 時に呼ぶ）。
   */
  disposeAll(): void {
    for (const cached of this.services.values()) {
      cached.service.dispose();
    }
    this.services.clear();
  }
}
