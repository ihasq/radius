/**
 * テスト並列化サポート
 *
 * 各テストファイルの beforeAll/afterAll で使用するヘルパー関数。
 * 一意の RADIUS_HOME を生成し、テスト終了後にクリーンアップする。
 */

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let testRadiusHome: string | null = null;

/**
 * テスト専用の RADIUS_HOME を設定する。
 * beforeAll で呼び出す。
 */
export function setupTestRadiusHome(testGroupId: string): void {
  testRadiusHome = mkdtempSync(join(tmpdir(), `radius-test-${testGroupId}-`));
  process.env.RADIUS_HOME = testRadiusHome;
}

/**
 * テスト専用の RADIUS_HOME をクリーンアップする。
 * afterAll で呼び出す。
 */
export function cleanupTestRadiusHome(): void {
  if (testRadiusHome) {
    try {
      rmSync(testRadiusHome, { recursive: true, force: true });
    } catch {
      // クリーンアップ失敗は無視
    }
    delete process.env.RADIUS_HOME;
    testRadiusHome = null;
  }
}
