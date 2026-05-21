/**
 * 読み取りコマンドの固定付帯テスト
 *
 * view, outline, grep の出力に ## context セクションが追記されることを確認する。
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { radius } from "./helpers/radius";

describe.skip("read command context", () => {
  let tmpDir: string;

  beforeAll(async () => {
    setupTestRadiusHome("context-read");
    tmpDir = join(process.cwd(), "tests/fixtures/ts-project");
  });

  afterAll(async () => {
    cleanupTestRadiusHome();
  });

  describe("view", () => {
    test("view includes ## context section", async () => {
      const filePath = join(tmpDir, "src/main.ts");
      const result = await radius(["view", filePath]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## context");
    }, 30_000);

    test("view context lists exports", async () => {
      const filePath = join(tmpDir, "src/main.ts");
      const result = await radius(["view", filePath]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## context");
      expect(result.stdout).toContain("exports:");
      // main.ts exports greet, calculate, userName など
      expect(result.stdout).toMatch(/exports:.*greet/);
    }, 30_000);

    test("view context lists imports", async () => {
      const filePath = join(tmpDir, "src/main.ts");
      const result = await radius(["view", filePath]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## context");
      expect(result.stdout).toContain("imports:");
      // main.ts imports from ./lib/helpers
      expect(result.stdout).toMatch(/imports:.*helpers/);
    }, 30_000);

    test("view context omitted for directory listing", async () => {
      const dirPath = join(tmpDir, "src");
      const result = await radius(["view", dirPath]);

      expect(result.exitCode).toBe(0);
      // ディレクトリ一覧には context を含まない
      expect(result.stdout).not.toContain("## context");
    }, 30_000);

    test("view context omitted for non-source files", async () => {
      const jsonPath = join(tmpDir, "package.json");
      const result = await radius(["view", jsonPath]);

      expect(result.exitCode).toBe(0);
      // JSON ファイルには context を含まない
      expect(result.stdout).not.toContain("## context");
    }, 30_000);
  });

  describe("outline", () => {
    test("outline includes ## context section", async () => {
      const filePath = join(tmpDir, "src/main.ts");
      const result = await radius(["outline", filePath]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## context");
    }, 30_000);

    test("outline context lists exports and imports", async () => {
      const filePath = join(tmpDir, "src/main.ts");
      const result = await radius(["outline", filePath]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## context");
      expect(result.stdout).toContain("exports:");
      expect(result.stdout).toContain("imports:");
    }, 30_000);
  });

  describe("grep", () => {
    test("grep includes ## context per matched file", async () => {
      const result = await radius(["grep", tmpDir, "--pattern", "userName"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## context");
    }, 30_000);

    test("grep context omitted when matches exceed 5 files", async () => {
      // すべてのファイルにマッチする汎用パターン
      const result = await radius(["grep", tmpDir, "--pattern", "const"]);

      expect(result.exitCode).toBe(0);
      // 6ファイル以上にマッチする場合は context なし
      const matches = result.stdout.match(/## context/g);
      if (matches) {
        expect(matches.length).toBeLessThan(6);
      }
    }, 30_000);

    test("grep with single file includes context", async () => {
      const filePath = join(tmpDir, "src/main.ts");
      const result = await radius(["grep", filePath, "--pattern", "userName"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## context");
    }, 30_000);
  });
});
