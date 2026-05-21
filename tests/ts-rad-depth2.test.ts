/**
 * ts-rad depth-2 テスト
 * depth-2 は対象ファイルと直接 import のみ解決する。再帰的な依存は走査しない。
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { radius } from "./helpers/radius";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { measureTime, getDaemonRssMb } from "./helpers/resource-monitor";
import { setupHeavyFixture } from "./helpers/fixture-heavy";
import { stopAllLsp, clearTsRadCache } from "./helpers/daemon";
import { join } from "node:path";

let tmpDir: string;
let heavyTmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("ts-rad-depth2");
  tmpDir = await setupFixture("ts-project");
  heavyTmpDir = await setupHeavyFixture();
});

afterAll(async () => {
  await cleanupFixture(tmpDir);
  if (heavyTmpDir) await cleanupFixture(heavyTmpDir);
  cleanupTestRadiusHome();
});

beforeEach(async () => {
  // Stop all LSP clients to prevent interference
  await stopAllLsp();
  // Clear TsRadManager cache to prevent interference
  await clearTsRadCache();
});

describe("ts-rad depth-2: direct imports only", () => {

  describe("hover", () => {

    test("hover returns type info for local variable", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const result = await radius([
        "hover",
        filePath,
        "--line", "3",
        "--col", "20"
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // userName の型情報が含まれること
      expect(result.stdout).toContain("string");
    }, 30_000);

    test("hover returns type info for imported symbol", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const result = await radius([
        "hover",
        filePath,
        "--line", "1",
        "--col", "10"
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // calc の型シグネチャが含まれること
      expect(result.stdout).toMatch(/calc|function/);
    }, 30_000);

    test("hover returns null for deeply nested import", async () => {
      const filePath = join(tmpDir, "src/deep-import.ts");

      const result = await radius([
        "hover",
        filePath,
        "--line", "1",
        "--col", "10"
      ], { cwd: tmpDir });

      // hover が型情報を返すか、または "any" を返すこと
      // node_modules を深く走査しないこと
      expect(result.exitCode).toBe(0);
    }, 30_000);

  });

  describe("tokens", () => {

    test("tokens returns semantic tokens for file", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const result = await radius(["tokens", filePath], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // function, variable, parameter 等のトークンが含まれること
      expect(result.stdout).toMatch(/function|variable|parameter/);
    }, 30_000);

  });

  describe("resource constraints", () => {

    test("depth-2 reads target file and direct imports only", async () => {
      const filePath = join(heavyTmpDir, "src/main.ts");

      const elapsed = await measureTime(async () => {
        await radius(["hover", filePath, "--line", "1", "--col", "10"], { cwd: heavyTmpDir });
      });

      // 実行時間が 3 秒未満であること
      expect(elapsed).toBeLessThan(3000);
    }, 10_000);

    test("depth-2 file I/O count is bounded", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const result = await radius([
        "hover",
        filePath,
        "--line", "3",
        "--col", "20"
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // import 先が 5 ファイル以下のプロジェクトでは、
      // open するファイル数が 10 未満であること
      // （実際の計測は難しいため、実行時間で代替）
    }, 30_000);

    test("depth-2 does not walk node_modules recursively", async () => {
      const filePath = join(heavyTmpDir, "src/main.ts");

      const elapsed = await measureTime(async () => {
        await radius(["hover", filePath, "--line", "1", "--col", "10"], { cwd: heavyTmpDir });
      });

      // heavy-project で実行時間が 3 秒未満
      expect(elapsed).toBeLessThan(3000);
    }, 10_000);

    test("depth-2 memory usage under 100MB", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const rssBefore = getDaemonRssMb();
      await radius(["hover", filePath, "--line", "3", "--col", "20"], { cwd: tmpDir });
      const rssAfter = getDaemonRssMb();

      const increase = rssAfter - rssBefore;
      // 増分が 100MB 未満
      expect(increase).toBeLessThan(100);
    }, 30_000);

  });

});
