/**
 * 規約・成功時tips テスト
 *
 * プロジェクト規約の表示と成功時のtips表示を確認する。
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { radius, extractTag } from "./helpers/radius";

describe.skip("conventions and success tips", () => {
  let tmpDir: string;
  let emptyProjectDir: string;

  beforeAll(async () => {
    setupTestRadiusHome("context-conventions");
    tmpDir = join(process.cwd(), "tests/fixtures/ts-project");
  });

  beforeEach(() => {
    // テスト間でフィクスチャをクリーンアップ
    const files = [
      "tests/fixtures/ts-project/src/first-cmd.ts",
      "tests/fixtures/ts-project/src/second-cmd.ts",
      "tests/fixtures/ts-project/src/empty-test.ts",
      "tests/fixtures/ts-project/src/config-test.ts",
      "tests/fixtures/ts-project/.editorconfig",
    ];
    for (const file of files) {
      try {
        rmSync(file, { force: true });
      } catch {}
    }

    // 空プロジェクトディレクトリを作成
    emptyProjectDir = mkdtempSync(join(tmpdir(), "radius-test-empty-"));
  });

  afterAll(async () => {
    cleanupTestRadiusHome();
    // 空プロジェクトディレクトリをクリーンアップ
    try {
      rmSync(emptyProjectDir, { recursive: true, force: true });
    } catch {}
  });

  describe("project conventions", () => {
    test("first command includes ## conventions, second omits", async () => {
      // 1回目のコマンド（セッション初回）
      const firstFile = join(tmpDir, "src/first-cmd.ts");
      const firstResult = await radius(
        ["create", firstFile, "--content", "export const first = 1;"],
        { cwd: tmpDir }
      );
      expect(firstResult.exitCode).toBe(0);
      expect(firstResult.stdout).toContain("## conventions");
      expect(firstResult.stdout).toMatch(/indent:|module:|strict:/);
      const tag = extractTag(firstResult.stdout);

      // 2回目のコマンド（同一セッション、フィクスチャリセットなし）
      const secondFile = join(tmpDir, "src/second-cmd.ts");
      const secondResult = await radius(
        ["create", secondFile, "--content", "export const second = 2;", "--tag", tag],
        { cwd: tmpDir }
      );
      expect(secondResult.exitCode).toBe(0);
      // 2回目は conventions なし
      expect(secondResult.stdout).not.toContain("## conventions");

      // クリーンアップ
      rmSync(firstFile, { force: true });
      rmSync(secondFile, { force: true });
    }, 30_000);

    test("conventions reads tsconfig.json", async () => {
      const newFile = join(tmpDir, "src/config-test.ts");
      const result = await radius([
        "create",
        newFile,
        "--content",
        "export const test = 1;",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## conventions");
      // tsconfig.json に strict: true が設定されている
      expect(result.stdout).toMatch(/strict:\s*true/);

      // クリーンアップ
      rmSync(newFile, { force: true });
    }, 30_000);

    test("conventions handles missing config files gracefully", async () => {
      // 設定ファイルのないディレクトリでテスト
      const newFile = join(emptyProjectDir, "test.ts");
      const result = await radius([
        "create",
        newFile,
        "--content",
        "export const test = 1;",
      ]);

      expect(result.exitCode).toBe(0);
      // conventions が省略されるか、最小限の情報のみ
      // エラーにはならない
    }, 30_000);
  });

  describe("success tips", () => {
    test("create without --content shows success tip", async () => {
      const emptyFile = join(tmpDir, "src/empty-test.ts");
      const result = await radius(["create", emptyFile]);

      expect(result.exitCode).toBe(0);
      // 空ファイル作成時の成功tip
      expect(result.stderr).toMatch(/tip:/);
      expect(result.stderr).toMatch(/--content/);

      // クリーンアップ
      rmSync(emptyFile, { force: true });
    }, 30_000);

    test("create with --content shows no tip", async () => {
      const contentFile = join(tmpDir, "src/content-test.ts");
      const result = await radius([
        "create",
        contentFile,
        "--content",
        "export const x = 1;",
      ]);

      expect(result.exitCode).toBe(0);
      // --content 指定時はtipなし
      expect(result.stderr).not.toMatch(/tip:/);

      // クリーンアップ
      rmSync(contentFile, { force: true });
    }, 30_000);

    test("view of empty directory shows tip", async () => {
      const emptyDir = join(tmpDir, "src/empty-dir");
      mkdirSync(emptyDir, { recursive: true });

      const result = await radius(["view", emptyDir]);

      expect(result.exitCode).toBe(0);
      // 空ディレクトリのtip
      expect(result.stderr).toMatch(/tip:/);

      // クリーンアップ
      rmSync(emptyDir, { recursive: true, force: true });
    }, 30_000);

    test("grep with 0 matches shows tip", async () => {
      const result = await radius([
        "grep",
        tmpDir,
        "--pattern",
        "nonexistent_string_xyz",
      ]);

      // 0マッチは既にエラーtipがある
      expect(result.stderr).toMatch(/tip:/);
      expect(result.stderr).toMatch(/--ignore-case|--regex/);
    }, 30_000);
  });
});
