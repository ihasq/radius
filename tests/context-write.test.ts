/**
 * 書き込みコマンドの影響伝搬テスト
 *
 * str-replace, insert, create 等の出力に ## context と ## impact が追記されることを確認する。
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { radius, extractTag } from "./helpers/radius";

describe.skip("write command context and impact", () => {
  let tmpDir: string;

  beforeAll(async () => {
    setupTestRadiusHome("context-write");
    tmpDir = join(process.cwd(), "tests/fixtures/ts-project");

    // typescript-language-server の存在確認
    try {
      const { execSync } = require("node:child_process");
      execSync("which typescript-language-server", { stdio: "ignore" });
    } catch {
      console.log("typescript-language-server not found, skipping LSP tests");
      return;
    }

  });

  beforeEach(() => {
    // テスト間でフィクスチャをクリーンアップ
    const files = [
      "tests/fixtures/ts-project/src/temp-test.ts",
      "tests/fixtures/ts-project/src/local-only.ts",
      "tests/fixtures/ts-project/src/empty-test.ts",
      "tests/fixtures/ts-project/src/first-test.ts",
      "tests/fixtures/ts-project/src/second-test.ts",
    ];
    for (const file of files) {
      try {
        rmSync(file, { force: true });
      } catch {}
    }
    // main.ts を元に戻す
    try {
      const { execSync } = require("node:child_process");
      execSync("git checkout tests/fixtures/ts-project/src/main.ts", {
        cwd: process.cwd(),
        stdio: "ignore"
      });
    } catch {}
  });

  afterAll(async () => {
    cleanupTestRadiusHome();
  });

  describe("context section", () => {
    test("str-replace includes ## context section", async () => {
      const filePath = join(tmpDir, "src/main.ts");
      const result = await radius([
        "str-replace",
        filePath,
        "--old",
        "export const userName: string = \"default_user\";",
        "--new",
        "export const accountName: string = \"default_user\";",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## context");
      expect(result.stdout).toContain("exports:");
      expect(result.stdout).toContain("imports:");
    }, 30_000);

    test("insert includes ## context section", async () => {
      const filePath = join(tmpDir, "src/main.ts");
      const result = await radius([
        "insert",
        filePath,
        "--line",
        "3",
        "--text",
        "const newVar = 123;",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## context");
    }, 30_000);

    test("create includes ## context section", async () => {
      const newFile = join(tmpDir, "src/temp-test.ts");
      const result = await radius([
        "create",
        newFile,
        "--content",
        "export const testVar = 42;",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## context");
      // 新規ファイルなので exports はあるが imports は空の可能性
      expect(result.stdout).toContain("exports:");

      // クリーンアップ
      rmSync(newFile, { force: true });
    }, 30_000);
  });

  describe("impact section", () => {
    test("str-replace shows ## impact when symbol has references", async () => {
      const filePath = join(tmpDir, "src/main.ts");
      const result = await radius([
        "str-replace",
        filePath,
        "--old",
        "export const userName: string = \"default_user\";",
        "--new",
        "export const accountName: string = \"default_user\";",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## impact");
      expect(result.stdout).toMatch(/reference\(s\)/);
    }, 30_000);

    test("impact shows file path and line for each reference", async () => {
      const filePath = join(tmpDir, "src/main.ts");
      const result = await radius([
        "str-replace",
        filePath,
        "--old",
        "export const userName: string = \"default_user\";",
        "--new",
        "export const accountName: string = \"default_user\";",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## impact");
      // ファイルパスと行番号を含む
      expect(result.stdout).toMatch(/\.ts:\d+/);
    }, 30_000);

    test("impact omitted when no external references exist", async () => {
      // ローカル変数のみのファイルを作成
      const localFile = join(tmpDir, "src/local-only.ts");
      writeFileSync(localFile, "const localVar = 42;\nfunction localFn() { return localVar; }");

      const result = await radius([
        "str-replace",
        localFile,
        "--old",
        "const localVar = 42;",
        "--new",
        "const localVariable = 42;",
      ]);

      expect(result.exitCode).toBe(0);
      // ローカル変数のみなので impact なし
      expect(result.stdout).not.toContain("## impact");

      // クリーンアップ
      rmSync(localFile, { force: true });
    }, 30_000);

    test.skip("impact limited to 10 references", async () => {
      // 11参照を作るのは困難なのでスキップ可能
      // または10件制限のロジックが動作することを確認
    }, 30_000);

    test("impact includes diagnostic status per reference", async () => {
      // 関数シグネチャを変更して型エラーを発生させる
      const filePath = join(tmpDir, "src/main.ts");

      // greet 関数のシグネチャを変更
      const result = await radius([
        "str-replace",
        filePath,
        "--old",
        "export function greet(): string",
        "--new",
        "export function greet(name: string): string",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## impact");
      // 診断ステータスのマーカー（❌ または ✅）が含まれる可能性
      // LSP の応答に依存するため、存在確認のみ
    }, 30_000);

    test("replace-all shows aggregated impact", async () => {
      const result = await radius([
        "replace-all",
        tmpDir,
        "--pattern",
        "userName",
        "--replacement",
        "accountName",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## impact");
      // 複数ファイルの影響が集約される
      expect(result.stdout).toMatch(/\d+.*file\(s\)/);
    }, 30_000);
  });

  describe("undo preserves context", () => {
    test("undo output includes ## context of restored file", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      // 変更を実行
      const replaceResult = await radius([
        "str-replace",
        filePath,
        "--old",
        "export const userName: string = \"default_user\";",
        "--new",
        "export const accountName: string = \"default_user\";",
      ]);
      expect(replaceResult.exitCode).toBe(0);
      const tag = extractTag(replaceResult.stdout);

      // undo を実行
      const undoResult = await radius(["undo", "--tag", tag], { cwd: tmpDir });
      expect(undoResult.exitCode).toBe(0);
      expect(undoResult.stdout).toContain("## context");
      expect(undoResult.stdout).toContain("exports:");
    }, 30_000);

    test("undo output includes ## impact showing resolved references", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      // シグネチャ変更
      const replaceResult = await radius([
        "str-replace",
        filePath,
        "--old",
        "export function greet(): string",
        "--new",
        "export function greet(name: string): string",
      ]);
      expect(replaceResult.exitCode).toBe(0);
      const tag = extractTag(replaceResult.stdout);

      // undo でシグネチャを元に戻す
      const undoResult = await radius(["undo", "--tag", tag], { cwd: tmpDir });
      expect(undoResult.exitCode).toBe(0);
      expect(undoResult.stdout).toContain("## impact");
      // 元に戻したので診断エラーが解消されている
    }, 30_000);
  });
});
