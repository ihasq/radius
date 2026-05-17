/**
 * Part C: LSP診断テスト
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius } from "./helpers/radius";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { spawnSync } from "bun";
import { join } from "node:path";

// typescript-language-server の存在チェック
const TSL_AVAILABLE = (() => {
  try {
    // まず node_modules/.bin/ を試す
    const localPath = join(process.cwd(), "node_modules", ".bin", "typescript-language-server");
    if (require("node:fs").existsSync(localPath)) {
      const result = spawnSync([localPath, "--version"]);
      if (result.exitCode === 0) return true;
    }

    // 次にPATHを試す
    const result = spawnSync(["typescript-language-server", "--version"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
})();

let tmpDir: string;

beforeAll(async () => {
  await startDaemon();
});

afterAll(async () => {
  await stopDaemon();
});

beforeEach(async () => {
  tmpDir = await setupFixture("ts-project");
});

afterEach(async () => {
  await cleanupFixture(tmpDir);
});

describe.skipIf(!TSL_AVAILABLE)("LSP diagnostics", () => {
  test("str-replace with syntax error reports diagnostic", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 中括弧を除去して構文エラーを作成（より具体的な文字列を使用）
    const result = await radius(
      [
        "str-replace",
        filePath,
        "--old",
        "export function greet(): string {",
        "--new",
        "export function greet(): string",
      ],
      { cwd: tmpDir }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("diagnostics:");
    expect(result.stdout).toMatch(/error/i);

    // Undo to restore
    await radius(["undo"], { cwd: tmpDir });
  }, 30_000);

  test("str-replace fixing error shows clean diagnostics", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // まず壊す（より具体的な文字列を使用）
    await radius(
      [
        "str-replace",
        filePath,
        "--old",
        "export function greet(): string {",
        "--new",
        "export function greet(): string",
      ],
      { cwd: tmpDir }
    );

    // 修復する
    const result = await radius(
      [
        "str-replace",
        filePath,
        "--old",
        "export function greet(): string",
        "--new",
        "export function greet(): string {",
      ],
      { cwd: tmpDir }
    );

    expect(result.stdout).toContain("diagnostics:");
    // エラーが解消されているか確認
    expect(result.stdout).not.toMatch(/error\[/);

    await radius(["undo"], { cwd: tmpDir });
    await radius(["undo"], { cwd: tmpDir });
  }, 30_000);

  test("insert introducing type error reports diagnostic", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 型エラーを挿入
    const result = await radius(
      [
        "insert",
        filePath,
        "--line",
        "1",
        "--text",
        "const x: number = 'hello';",
      ],
      { cwd: tmpDir }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("diagnostics:");
    expect(result.stdout).toMatch(/error/i);

    await radius(["undo"], { cwd: tmpDir });
  }, 30_000);

  test("create with valid code shows no errors", async () => {
    const newFile = join(tmpDir, "src/newfile.ts");

    const result = await radius(
      [
        "create",
        newFile,
        "--content",
        "export const valid: number = 42;",
      ],
      { cwd: tmpDir }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("diagnostics:");
    // エラーがないことを確認
    expect(result.stdout).not.toMatch(/error\[/);

    await radius(["undo"], { cwd: tmpDir });
  }, 30_000);

  test("modify-var reports diagnostics after rename", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // userNameを別の名前に変更（utils.tsのimportが影響を受ける可能性）
    const result = await radius(
      [
        "modify-var",
        filePath,
        "--from",
        "userName",
        "--to",
        "renamedVar",
      ],
      { cwd: tmpDir }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("diagnostics:");

    await radius(["undo"], { cwd: tmpDir });
  }, 30_000);

  test("diagnostics unavailable for non-LSP files", async () => {
    const pyFile = join(tmpDir, "test.py");

    await radius(
      ["create", pyFile, "--content", "x = 1"],
      { cwd: tmpDir }
    );

    const result = await radius(
      [
        "str-replace",
        pyFile,
        "--old",
        "x = 1",
        "--new",
        "x = 2",
      ],
      { cwd: tmpDir }
    );

    expect(result.exitCode).toBe(0);
    // Python用のLSPがない場合、診断セクションは出力されない
    expect(result.stdout).not.toContain("error");
    expect(result.stdout).toContain("replaced 1 occurrence");

    await radius(["undo"], { cwd: tmpDir });
    await radius(["undo"], { cwd: tmpDir });
  }, 30_000);
});

// LSPが利用できない場合の通知テスト
describe.skipIf(TSL_AVAILABLE)("LSP not available", () => {
  test("test suite skipped - typescript-language-server not found", () => {
    console.warn("LSP diagnostic tests skipped: typescript-language-server not found");
    expect(true).toBe(true);
  });
});
