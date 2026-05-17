/**
 * テストフィクスチャヘルパー
 */

import { mkdtempSync, rmSync, cpSync, readFileSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const cleanupList: string[] = [];

/**
 * フィクスチャディレクトリを一時ディレクトリにコピーし、
 * そのパスを返す。テスト終了時にクリーンアップする。
 * セッション分離のため、全セッションファイルをクリーンアップする。
 */
export async function setupFixture(fixtureName: string): Promise<string> {
  // セッション分離: 全 session.json を削除
  cleanupAllSessions();

  const fixtureDir = join(process.cwd(), "tests/fixtures", fixtureName);
  const tmpDir = mkdtempSync(join(tmpdir(), "radius-test-"));

  cpSync(fixtureDir, tmpDir, { recursive: true });
  cleanupList.push(tmpDir);

  return tmpDir;
}

/**
 * 全セッションファイルをクリーンアップする。
 * テスト間のセッション分離を保証する。
 */
function cleanupAllSessions(): void {
  try {
    const radiusDir = join(homedir(), ".radius");
    if (!existsSync(radiusDir)) return;

    for (const entry of readdirSync(radiusDir)) {
      const sessionPath = join(radiusDir, entry, "session.json");
      if (existsSync(sessionPath)) {
        try {
          unlinkSync(sessionPath);
        } catch {
          // 削除失敗は無視
        }
      }
    }
  } catch {
    // ディレクトリ読み取り失敗は無視
  }
}

/**
 * 一時ディレクトリを削除する。
 */
export async function cleanupFixture(tmpDir: string): Promise<void> {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
    const index = cleanupList.indexOf(tmpDir);
    if (index > -1) {
      cleanupList.splice(index, 1);
    }
  } catch {
    // クリーンアップ失敗は無視
  }
}

/**
 * 全ての一時ディレクトリをクリーンアップする。
 */
export async function cleanupAll(): Promise<void> {
  for (const tmpDir of cleanupList) {
    await cleanupFixture(tmpDir);
  }
}

/**
 * フィクスチャのファイル内容を読み取る。
 */
export function readFixtureFile(tmpDir: string, relativePath: string): string {
  return readFileSync(join(tmpDir, relativePath), "utf-8");
}
