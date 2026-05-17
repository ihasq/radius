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
    // セッションファイルもクリーンアップ
    await cleanupSession(tmpDir);

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

/**
 * プロジェクトのセッションファイルをクリーンアップする。
 * テスト間のセッション分離を保証するために使用する。
 */
export async function cleanupSession(tmpDir: string): Promise<void> {
  try {
    const homeDir = require("node:os").homedir();
    const { projectHash } = await import("../../src/shared/paths");
    const hash = await projectHash(tmpDir);
    const sessionFile = join(homeDir, ".radius", hash, "session.json");

    try {
      rmSync(sessionFile, { force: true });
    } catch {
      // セッションファイルがない場合は無視
    }
  } catch {
    // クリーンアップ失敗は無視
  }
}
