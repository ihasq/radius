/**
 * DAP Session Manager
 *
 * デバッグセッションを管理する
 */

import { DapClient } from "./client";

/**
 * グローバル DAP クライアント（シングルトン）
 */
let globalDapClient: DapClient | null = null;

/**
 * DAP クライアントを取得（シングルトン）
 */
export function getDapClient(): DapClient {
  if (!globalDapClient) {
    globalDapClient = new DapClient();
  }
  return globalDapClient;
}

/**
 * DAP クライアントをリセット（テスト用）
 */
export function resetDapClient(): void {
  globalDapClient = null;
}
