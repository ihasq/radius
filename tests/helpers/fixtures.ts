/**
 * テストフィクスチャヘルパー
 */

import { mkdtempSync, rmSync, cpSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cleanupList: string[] = [];

/**
 * フィクスチャディレクトリを一時ディレクトリにコピーし、
 * そのパスを返す。テスト終了時にクリーンアップする。
 */
export async function setupFixture(fixtureName: string): Promise<string> {
  const fixtureDir = join(process.cwd(), "tests/fixtures", fixtureName);
  const tmpDir = mkdtempSync(join(tmpdir(), "radius-test-"));

  cpSync(fixtureDir, tmpDir, { recursive: true });
  cleanupList.push(tmpDir);

  return tmpDir;
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
