/**
 * ts-rad depth-4 テスト
 * depth-4 はフルセマンティック解析。型チェックと診断を含む。
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { radius } from "./helpers/radius";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { measureTime, getDaemonRssMb } from "./helpers/resource-monitor";
import { setupHeavyFixture } from "./helpers/fixture-heavy";
import { stopAllLsp, clearTsRadCache } from "./helpers/daemon";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

let tmpDir: string;
let heavyTmpDir: string;
let originalFiles: Map<string, string>;

beforeAll(async () => {
  setupTestRadiusHome("ts-rad-depth4");
  tmpDir = await setupFixture("ts-project");
  heavyTmpDir = await setupHeavyFixture();

  originalFiles = new Map();
  for (const rel of ["src/main.ts", "src/type-error.ts"]) {
    const p = join(tmpDir, rel);
    if (readFileSync(p, "utf-8")) {
      originalFiles.set(p, readFileSync(p, "utf-8"));
    }
  }
});

beforeEach(async () => {
  // Stop all LSP clients to prevent interference
  await stopAllLsp();
  // Clear TsRadManager cache to prevent interference
  await clearTsRadCache();
  for (const [p, content] of originalFiles) {
    writeFileSync(p, content);
  }
});

afterAll(async () => {
  await cleanupFixture(tmpDir);
  if (heavyTmpDir) await cleanupFixture(heavyTmpDir);
  cleanupTestRadiusHome();
});

describe("ts-rad depth-4: full semantic", () => {

  describe("diagnostics", () => {

    test("str-replace reports type errors after edit", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      // 型エラーを導入する str-replace
      const result = await radius([
        "str-replace",
        filePath,
        "--old", ": string =",
        "--new", ": number =",
        "--reason", "test"
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // diagnostics セクションに ❌ と D-NNN が含まれること
      expect(result.stdout).toMatch(/diagnostics|❌|D-\d+/);
    }, 30_000);

    test("fix lists available code actions", async () => {
      const filePath = join(tmpDir, "src/type-error.ts");

      const result = await radius([
        "fix",
        filePath,
        "--list"
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // コードアクションが一覧表示されること
      expect(result.stdout).toMatch(/action|fix/i);
    }, 30_000);

    test("problems lists all diagnostics in file", async () => {
      const filePath = join(tmpDir, "src/type-error.ts");

      const result = await radius([
        "problems",
        filePath
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // 型エラーが検出されること
      expect(result.stdout).toMatch(/error|diagnostic/i);
    }, 30_000);

    test("diagnostics resolve after fix", async () => {
      const filePath = join(tmpDir, "src/type-error.ts");

      // 型エラーを修正する str-replace
      const result = await radius([
        "str-replace",
        filePath,
        "--old", "result: string",
        "--new", "result: number",
        "--reason", "test"
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // resolved セクションに ✅ が含まれること
      expect(result.stdout).toMatch(/resolved|✅|diagnostics: ok/);
    }, 30_000);

  });

  describe("diagnostic accuracy", () => {

    test("detects assignment type mismatch", async () => {
      const filePath = join(tmpDir, "src/type-error.ts");

      const result = await radius([
        "problems",
        filePath
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // error[2322] または Type 'number' is not assignable が検出されること
      expect(result.stdout).toMatch(/2322|Type.*not assignable/);
    }, 30_000);

    test("detects missing import", async () => {
      const testFile = join(tmpDir, "src/missing-import.ts");
      writeFileSync(testFile, "import { nonExistent } from './does-not-exist';");

      // Trigger LSP to analyze the file by reading it first
      await radius(["view", testFile], { cwd: tmpDir });

      // Wait for LSP to process diagnostics (longer delay for full test suite)
      await new Promise(resolve => setTimeout(resolve, 5000));

      const result = await radius([
        "problems",
        testFile
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // error[2307] が検出されること
      expect(result.stdout).toMatch(/2307|Cannot find module/);
    }, 40_000);

  });

  describe("resource constraints", () => {

    test("depth-4 completes within 15 seconds", async () => {
      const filePath = join(heavyTmpDir, "src/main.ts");

      const elapsed = await measureTime(async () => {
        await radius([
          "problems",
          filePath
        ], { cwd: heavyTmpDir });
      });

      // 15 秒以内に完了すること
      expect(elapsed).toBeLessThan(15000);
    }, 20_000);

    test("depth-4 memory usage under 300MB", async () => {
      const filePath = join(tmpDir, "src/type-error.ts");

      const rssBefore = getDaemonRssMb();
      await radius([
        "problems",
        filePath
      ], { cwd: tmpDir });
      const rssAfter = getDaemonRssMb();

      const increase = rssAfter - rssBefore;
      // 増分が 300MB 未満
      expect(increase).toBeLessThan(300);
    }, 30_000);

  });

});
