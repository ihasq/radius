/**
 * create-enhanced.test.ts
 *
 * Tests for create --force, create --stdin, and create-all commands
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { radius } from "./helpers/radius";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("create-enhanced");
  tmpDir = await setupFixture("ts-project");
  await radius(["ping"], { cwd: tmpDir }); // Start daemon
});

afterAll(async () => {
  await cleanupFixture(tmpDir);
  cleanupTestRadiusHome();
});

describe("create --force", () => {

  test("1. 既存ファイルに --force なしで create → エラー", async () => {
    const existingFile = join(tmpDir, "src/main.ts");
    expect(existsSync(existingFile)).toBe(true);

    const result = await radius(["create", existingFile], { cwd: tmpDir });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("already exists");
  }, 15000);

  test("2. 既存ファイルに --force で create → 上書き成功", async () => {
    const existingFile = join(tmpDir, "src/utils.ts");
    const originalContent = readFileSync(existingFile, "utf-8");

    const result = await radius(["create", existingFile, "--force"], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(existsSync(existingFile)).toBe(true);
    // Content should be empty (overwritten)
    const newContent = readFileSync(existingFile, "utf-8");
    expect(newContent.trim()).toBe("");
  }, 15000);

  test("3. create --force --stdin で内容付き上書き", async () => {
    const testFile = join(tmpDir, "src/test-overwrite.ts");
    writeFileSync(testFile, "original content");

    const newContent = "export const overwritten = true;";
    const result = await radius(
      ["create", testFile, "--force", "--stdin"],
      { cwd: tmpDir, stdin: newContent }
    );

    expect(result.exitCode).toBe(0);
    const actualContent = readFileSync(testFile, "utf-8");
    expect(actualContent.trim()).toBe(newContent.trim());
  }, 15000);

  test("4. create --force が changeset を記録（undo 可能）", async () => {
    const testFile = join(tmpDir, "src/undo-test.ts");
    const originalContent = "original";
    writeFileSync(testFile, originalContent);

    const createResult = await radius(["create", testFile, "--force", "--stdin"], {
      cwd: tmpDir,
      stdin: "overwritten"
    });

    // Extract tag from create output
    const tagMatch = createResult.stdout.match(/radius-tag: ([^\s]+)/);
    const tag = tagMatch ? tagMatch[1] : null;

    // Undo
    const undoResult = await radius(["undo", ...(tag ? ["--tag", tag] : [])], { cwd: tmpDir });
    expect(undoResult.exitCode).toBe(0);

    const restoredContent = readFileSync(testFile, "utf-8");
    expect(restoredContent.trim()).toBe(originalContent);
  }, 20000);

  test("5. 上書き後に diagnostics が返ること", async () => {
    const testFile = join(tmpDir, "src/diag-test.ts");
    writeFileSync(testFile, "export const x = 1;");

    const result = await radius(
      ["create", testFile, "--force", "--stdin"],
      { cwd: tmpDir, stdin: "export const y: string = 123;" }
    );

    expect(result.stdout).toContain("diagnostics:");
  }, 15000);

  test("6. 上書き後に ## context が返ること", async () => {
    const testFile = join(tmpDir, "src/context-test.ts");
    writeFileSync(testFile, "export const old = 1;");

    const result = await radius(
      ["create", testFile, "--force", "--stdin"],
      { cwd: tmpDir, stdin: "export const newVar = 'test';" }
    );

    expect(result.stdout).toContain("## context");
    expect(result.stdout).toContain("exports:");
  }, 15000);

});

describe("create --stdin", () => {

  test("7. create --stdin で内容付き新規作成", async () => {
    const newFile = join(tmpDir, "src/stdin-new.ts");

    const content = "export const fromStdin = true;";
    const result = await radius(
      ["create", newFile, "--stdin"],
      { cwd: tmpDir, stdin: content }
    );

    expect(result.exitCode).toBe(0);
    expect(existsSync(newFile)).toBe(true);
    const actualContent = readFileSync(newFile, "utf-8");
    expect(actualContent.trim()).toBe(content.trim());
  }, 15000);

  test("8. create --stdin が空ファイル + insert の2ステップと同等の結果", async () => {
    const file1 = join(tmpDir, "src/stdin-combined.ts");
    const file2 = join(tmpDir, "src/twostep.ts");
    const content = "export const test = 1;";

    // Method 1: create --stdin
    await radius(["create", file1, "--stdin"], { cwd: tmpDir, stdin: content });

    // Method 2: create + insert
    await radius(["create", file2], { cwd: tmpDir });
    await radius(["insert", file2, "--line", "1", "--text", content], { cwd: tmpDir });

    const content1 = readFileSync(file1, "utf-8");
    const content2 = readFileSync(file2, "utf-8");

    expect(content1.trim()).toBe(content2.trim());
  }, 20000);

});

describe("create-all", () => {

  test("9. create-all --stdin で --- 区切りの複数ファイル作成", async () => {
    const input = `--- ${tmpDir}/multi1.ts
export const file1 = 1;
--- ${tmpDir}/multi2.ts
export const file2 = 2;
--- ${tmpDir}/multi3.ts
export const file3 = 3;`;

    const result = await radius(
      ["create-all", "--stdin"],
      { cwd: tmpDir, stdin: input }
    );

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, "multi1.ts"))).toBe(true);
    expect(existsSync(join(tmpDir, "multi2.ts"))).toBe(true);
    expect(existsSync(join(tmpDir, "multi3.ts"))).toBe(true);
  }, 20000);

  test("10. create-all で作成した全ファイルが1チェーンに記録", async () => {
    const input = `--- ${tmpDir}/chain1.ts
export const a = 1;
--- ${tmpDir}/chain2.ts
export const b = 2;`;

    const createResult = await radius(["create-all", "--stdin"], { cwd: tmpDir, stdin: input });

    // Extract tag from create-all output
    const tagMatch = createResult.stdout.match(/radius-tag: ([^\s]+)/);
    const tag = tagMatch ? tagMatch[1] : null;

    // Undo should remove both files
    const undoResult = await radius(["undo", ...(tag ? ["--tag", tag] : [])], { cwd: tmpDir });
    expect(undoResult.exitCode).toBe(0);

    expect(existsSync(join(tmpDir, "chain1.ts"))).toBe(false);
    expect(existsSync(join(tmpDir, "chain2.ts"))).toBe(false);
  }, 20000);

  test("11. create-all の出力に各ファイルの diagnostics が含まれる", async () => {
    const input = `--- ${tmpDir}/diag-all1.ts
export const x: number = 1;
--- ${tmpDir}/diag-all2.ts
export const y: string = "test";`;

    const result = await radius(
      ["create-all", "--stdin"],
      { cwd: tmpDir, stdin: input }
    );

    expect(result.stdout).toContain("diagnostics:");
  }, 20000);

  test("12. create-all の出力に各ファイルの ## context が含まれる", async () => {
    const input = `--- ${tmpDir}/ctx-all1.ts
export const alpha = 1;
--- ${tmpDir}/ctx-all2.ts
export const beta = 2;`;

    const result = await radius(
      ["create-all", "--stdin"],
      { cwd: tmpDir, stdin: input }
    );

    expect(result.stdout).toContain("## context");
    expect(result.stdout).toContain("exports:");
  }, 20000);

  test("13. create-all で既存ファイルがある場合はエラー（--force なし）", async () => {
    const existingFile = join(tmpDir, "src/main.ts");
    const input = `--- ${existingFile}
new content`;

    const result = await radius(
      ["create-all", "--stdin"],
      { cwd: tmpDir, stdin: input }
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("already exists");
  }, 15000);

  test("14. create-all --force で既存ファイルを含む一括上書き", async () => {
    const file1 = join(tmpDir, "force-all1.ts");
    const file2 = join(tmpDir, "force-all2.ts");
    writeFileSync(file1, "old content 1");
    writeFileSync(file2, "old content 2");

    const input = `--- ${file1}
new content 1
--- ${file2}
new content 2`;

    const result = await radius(
      ["create-all", "--force", "--stdin"],
      { cwd: tmpDir, stdin: input }
    );

    expect(result.exitCode).toBe(0);
    expect(readFileSync(file1, "utf-8")).toContain("new content 1");
    expect(readFileSync(file2, "utf-8")).toContain("new content 2");
  }, 20000);

  test("15. create-all の undo で全ファイルが復元", async () => {
    const file1 = join(tmpDir, "undo-all1.ts");
    const file2 = join(tmpDir, "undo-all2.ts");
    const original1 = "original 1";
    const original2 = "original 2";
    writeFileSync(file1, original1);
    writeFileSync(file2, original2);

    const input = `--- ${file1}
modified 1
--- ${file2}
modified 2`;

    const createResult = await radius(["create-all", "--force", "--stdin"], { cwd: tmpDir, stdin: input });

    // Extract tag from create-all output
    const tagMatch = createResult.stdout.match(/radius-tag: ([^\s]+)/);
    const tag = tagMatch ? tagMatch[1] : null;

    // Undo
    const undoResult = await radius(["undo", ...(tag ? ["--tag", tag] : [])], { cwd: tmpDir });
    expect(undoResult.exitCode).toBe(0);

    expect(readFileSync(file1, "utf-8")).toBe(original1);
    expect(readFileSync(file2, "utf-8")).toBe(original2);
  }, 20000);

});
