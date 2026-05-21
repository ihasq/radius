/**
 * Open VSX Registry Integration Test
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { radius } from "./helpers/radius";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { spawnSync } from "bun";

const NETWORK_AVAILABLE = (() => {
  try {
    const result = spawnSync(["curl", "-fsSI", "--max-time", "5", "https://open-vsx.org"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
})();

beforeAll(async () => {
  setupTestRadiusHome("openvsx");
});

afterAll(async () => {
  cleanupTestRadiusHome();
});

describe.skipIf(!NETWORK_AVAILABLE)("Open VSX integration", () => {
  test("ext install downloads from Open VSX", async () => {
    // 小さなパッケージをテスト用に使用
    const result = await radius([
      "ext", "install",
      "rust-lang.rust-analyzer",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/installed|success/i);

    // list で確認
    const listResult = await radius(["ext", "list"]);
    expect(listResult.stdout).toContain("rust-analyzer");

    // クリーンアップ
    await radius(["ext", "remove", "rust-lang.rust-analyzer"]);
  }, 60000);

  test("ext install with nonexistent extension returns error", async () => {
    const result = await radius([
      "ext", "install",
      "nonexistent.does-not-exist",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not found|failed/i);
  }, 60000);

  test("installed extension has correct metadata", async () => {
    await radius([
      "ext", "install",
      "rust-lang.rust-analyzer",
    ]);

    const listResult = await radius(["ext", "list"]);

    expect(listResult.stdout).toContain("rust-analyzer");
    // バージョン情報が含まれる
    expect(listResult.stdout).toMatch(/\d+\.\d+\.\d+/);
    // languages に rust が含まれる
    expect(listResult.stdout).toMatch(/rust/i);

    // クリーンアップ
    await radius(["ext", "remove", "rust-lang.rust-analyzer"]);
  }, 60000);

  test("ext remove after install cleans up", async () => {
    await radius([
      "ext", "install",
      "rust-lang.rust-analyzer",
    ]);

    const removeResult = await radius(["ext", "remove", "rust-lang.rust-analyzer"]);
    expect(removeResult.exitCode).toBe(0);

    // list で確認
    const listResult = await radius(["ext", "list"]);
    expect(listResult.stdout).not.toContain("rust-analyzer");

    // ディレクトリが削除されているか確認
    const homeDir = require("node:os").homedir();
    const extPath = require("node:path").join(homeDir, ".radius", "extensions", "rust-lang.rust-analyzer");
    expect(require("node:fs").existsSync(extPath)).toBe(false);
  }, 60000);

  test("reinstall overwrites previous version", async () => {
    // 1回目
    await radius([
      "ext", "install",
      "rust-lang.rust-analyzer",
    ]);

    // 2回目
    const result = await radius([
      "ext", "install",
      "rust-lang.rust-analyzer",
    ]);

    expect(result.exitCode).toBe(0);

    // list で1つだけ表示される
    const listResult = await radius(["ext", "list"]);
    const matches = listResult.stdout.match(/rust-analyzer/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBe(1);

    // クリーンアップ
    await radius(["ext", "remove", "rust-lang.rust-analyzer"]);
  }, 60000);
});

describe.skipIf(NETWORK_AVAILABLE)("Open VSX not available", () => {
  test("test suite skipped - network unavailable", () => {
    console.warn("Open VSX tests skipped: network unavailable");
    expect(true).toBe(true);
  });
});
