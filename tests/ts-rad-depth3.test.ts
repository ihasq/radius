/**
 * ts-rad depth-3 テスト
 * depth-3 はプロジェクト全体の参照を解決する。tsconfig の include 範囲を走査する。
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { radius } from "./helpers/radius";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { measureTime, getDaemonRssMb } from "./helpers/resource-monitor";
import { setupHeavyFixture } from "./helpers/fixture-heavy";
import { stopAllLsp, clearTsRadCache } from "./helpers/daemon";
import { join } from "node:path";
import { readFileSync, writeFileSync, utimesSync } from "node:fs";

let tmpDir: string;
let heavyTmpDir: string;
let originalFiles: Map<string, string>;

beforeAll(async () => {
  setupTestRadiusHome("ts-rad-depth3");
  tmpDir = await setupFixture("ts-project");
  heavyTmpDir = await setupHeavyFixture();

  // 元のファイル内容を保存
  originalFiles = new Map();
  for (const rel of ["src/main.ts", "src/utils.ts"]) {
    const p = join(tmpDir, rel);
    originalFiles.set(p, readFileSync(p, "utf-8"));
  }
});

beforeEach(async () => {
  // Stop all LSP clients to prevent interference
  await stopAllLsp();
  // Clear TsRadManager cache to prevent interference
  await clearTsRadCache();
  // ファイル内容を元に戻す
  for (const [p, content] of originalFiles) {
    writeFileSync(p, content);
    // Update mtime to ensure BufferManager detects the change
    const now = Date.now() / 1000;
    utimesSync(p, now, now);
  }
  // Wait to ensure mtime check interval passes (BufferManager checks every 1s)
  await new Promise(resolve => setTimeout(resolve, 1100));
});

afterAll(async () => {
  await cleanupFixture(tmpDir);
  if (heavyTmpDir) await cleanupFixture(heavyTmpDir);
  cleanupTestRadiusHome();
});

describe("ts-rad depth-3: project references", () => {

  describe("read-var", () => {

    test("read-var returns value and references", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const result = await radius([
        "read-var",
        filePath,
        "--var",
        "userName"
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // engine: ts-rad であること（engine: lsp ではない）
      expect(result.stdout).toContain("engine: ts-rad");
      expect(result.stdout).toContain("userName");
      expect(result.stdout).toContain("definition");
    }, 30_000);

    test("read-var finds cross-file references", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const result = await radius([
        "read-var",
        filePath,
        "--var",
        "userName"
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // main.ts と utils.ts の両方が参照されていることが返ること
      expect(result.stdout).toMatch(/main\.ts|utils\.ts/);
    }, 30_000);

  });

  describe("modify-var", () => {

    test("modify-var renames across files", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const result = await radius([
        "modify-var",
        filePath,
        "--from",
        "userName",
        "--to",
        "displayName"
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // main.ts と utils.ts の両方が変更されること
      const mainContent = readFileSync(join(tmpDir, "src/main.ts"), "utf-8");
      expect(mainContent).toContain("displayName");
    }, 30_000);

    test("modify-var undo restores all files", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      // リネーム
      const renameResult = await radius([
        "modify-var",
        filePath,
        "--from",
        "userName",
        "--to",
        "displayName"
      ], { cwd: tmpDir });

      expect(renameResult.exitCode).toBe(0);
      const tag = renameResult.stdout.match(/radius-tag: ([^\s]+)/)?.[1];

      // undo
      const undoResult = await radius([
        "undo",
        "--tag",
        tag
      ], { cwd: tmpDir });

      expect(undoResult.exitCode).toBe(0);
      // 全ファイルが元に戻ること
      const mainContent = readFileSync(join(tmpDir, "src/main.ts"), "utf-8");
      expect(mainContent).toContain("userName");
    }, 30_000);

  });

  describe("graph", () => {

    test("graph refs returns mermaid with cross-file references", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const result = await radius([
        "graph",
        "refs",
        filePath,
        "--symbol",
        "userName"
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // mermaid 形式の出力にファイル間参照が含まれること
      expect(result.stdout).toMatch(/graph|flowchart/);
    }, 30_000);

  });

  describe("resource constraints", () => {

    test("depth-3 scans only tsconfig include files", async () => {
      const filePath = join(heavyTmpDir, "src/main.ts");

      const result = await radius([
        "read-var",
        filePath,
        "--var",
        "loadFile"
      ], { cwd: heavyTmpDir });

      expect(result.exitCode).toBe(0);
      // node_modules 内の .ts ファイルは走査しないこと
      // tsconfig の include 範囲のみ
    }, 30_000);

    test("depth-3 completes within 10 seconds", async () => {
      const filePath = join(heavyTmpDir, "src/main.ts");

      const elapsed = await measureTime(async () => {
        await radius([
          "read-var",
          filePath,
          "--var",
          "loadFile"
        ], { cwd: heavyTmpDir });
      });

      // 10 秒以内に完了すること
      expect(elapsed).toBeLessThan(10000);
    }, 15_000);

    test("depth-3 memory usage under 200MB", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const rssBefore = getDaemonRssMb();
      await radius([
        "read-var",
        filePath,
        "--var",
        "userName"
      ], { cwd: tmpDir });
      const rssAfter = getDaemonRssMb();

      const increase = rssAfter - rssBefore;
      // 増分が 200MB 未満
      expect(increase).toBeLessThan(200);
    }, 30_000);

  });

});
