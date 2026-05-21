/**
 * ts-rad depth-0 テスト
 * depth-0 は Language Service を使用しない。ファイル内容のみを返す。
 * TSプロセスを一切起動しないことを検証する。
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { radius } from "./helpers/radius";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { getTsserverCount } from "./helpers/resource-monitor";
import { join } from "node:path";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("ts-rad-depth0");
  tmpDir = await setupFixture("ts-project");
});

afterAll(async () => {
  await cleanupFixture(tmpDir);
  cleanupTestRadiusHome();
});

describe("ts-rad depth-0", () => {

  test("view returns file content without starting tsserver", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["view", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("export const userName");

    // tsserver プロセスが 0 件であること
    const tsserverCount = getTsserverCount();
    expect(tsserverCount).toBe(0);
  }, 30_000);

  test("str-replace operates without tsserver", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "str-replace",
      filePath,
      "--old", "default_user",
      "--new", "test_user",
      "--reason", "test"
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);

    // tsserver プロセスが 0 件であること
    const tsserverCount = getTsserverCount();
    expect(tsserverCount).toBe(0);
  }, 30_000);

  test("insert operates without tsserver", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "insert",
      filePath,
      "--line", "1",
      "--text", "// Test comment"
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);

    // tsserver プロセスが 0 件であること
    const tsserverCount = getTsserverCount();
    expect(tsserverCount).toBe(0);
  }, 30_000);

  test("create operates without tsserver", async () => {
    const newFile = join(tmpDir, "src/test-new.ts");

    const result = await radius([
      "create",
      newFile,
      "--content", "export const x = 1;",
      "--reason", "test"
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(existsSync(newFile)).toBe(true);

    // tsserver プロセスが 0 件であること
    const tsserverCount = getTsserverCount();
    expect(tsserverCount).toBe(0);
  }, 30_000);

  test("grep operates without tsserver", async () => {
    const searchPath = join(tmpDir, "src");

    const result = await radius([
      "grep",
      searchPath,
      "--pattern", "userName"
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("main.ts");

    // tsserver プロセスが 0 件であること
    const tsserverCount = getTsserverCount();
    expect(tsserverCount).toBe(0);
  }, 30_000);

  test("diff operates without tsserver", async () => {
    // git init + commit + 変更 + radius diff
    if (!existsSync(join(tmpDir, ".git"))) {
      execSync("git init && git config user.email 'test@test.com' && git config user.name 'Test'", { cwd: tmpDir });
      execSync("git add -A && git commit -m 'initial'", { cwd: tmpDir });
    }

    const filePath = join(tmpDir, "src/main.ts");
    const content = "export const userName: string = 'modified';\n";
    writeFileSync(filePath, content);

    const result = await radius(["diff", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);

    // tsserver プロセスが 0 件であること
    const tsserverCount = getTsserverCount();
    expect(tsserverCount).toBe(0);
  }, 30_000);

});
