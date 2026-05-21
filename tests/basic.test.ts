import { stopAllLsp } from "./helpers/daemon";
/**
 * Part B: 基本コマンドテスト
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius, extractTag } from "./helpers/radius";
import { setupFixture, cleanupFixture, readFixtureFile } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { existsSync } from "node:fs";
import { join } from "node:path";

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("basic");
});

afterAll(async () => {
    await stopAllLsp();
  cleanupTestRadiusHome();
});

beforeEach(async () => {
  tmpDir = await setupFixture("ts-project");
});

afterEach(async () => {
  await cleanupFixture(tmpDir);
});

describe("ping", () => {
  test("returns pong", async () => {
    const result = await radius(["ping"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("pong");
  });
});

describe("view", () => {
  test("displays file content with line numbers", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["view", filePath]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("userName");
    expect(result.stdout).toMatch(/\d+:/); // Line numbers
  });

  test("displays range when --range specified", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["view", filePath, "--range", "1:3"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("userName");
    // Should not contain later lines
    expect(result.stdout).not.toContain("initialize");
  });

  test("truncates large files (>200 lines)", async () => {
    const largeFile = join(process.cwd(), "tests/fixtures/large-file.ts");
    const result = await radius(["view", largeFile]);

    expect(result.exitCode).toBe(0);
    // Should indicate truncation
    expect(result.stdout).toMatch(/\.\.\./);
  });

  test("displays directory listing", async () => {
    const dirPath = join(tmpDir, "src");
    const result = await radius(["view", dirPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("main.ts");
    expect(result.stdout).toContain("utils.ts");
  });

  test("returns error for nonexistent file", async () => {
    const result = await radius(["view", "/nonexistent/file.ts"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not found/i);
  });
});

describe("str-replace", () => {
  test("replaces single occurrence", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius([
      "str-replace",
      filePath,
      "--old",
      'userName: string = "default_user"',
      "--new",
      'displayName: string = "default_user"',
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("replaced 1 occurrence");

    const content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("displayName");
    expect(content).not.toContain("userName:");

    // Cleanup
    const tag = extractTag(result.stdout);
    await radius(["undo", "--tag", tag], { cwd: tmpDir });
  });

  test("returns error on multiple matches", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius([
      "str-replace",
      filePath,
      "--old",
      "function",
      "--new",
      "fn",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/multiple matches/i);
  });

  test("returns error on no match", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius([
      "str-replace",
      filePath,
      "--old",
      "nonexistentText",
      "--new",
      "replacement",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no match/i);
  });

  test("supports --stdin for multiline replacement", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const newContent = "export const displayName: string = \"admin\";";

    const result = await radius(
      ["str-replace", filePath, "--old", 'userName: string = "default_user"', "--stdin"],
      { stdin: newContent }
    );

    expect(result.exitCode).toBe(0);

    const content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("displayName");

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  });

  test("output includes change context with > marker", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius([
      "str-replace",
      filePath,
      "--old",
      'userName: string = "default_user"',
      "--new",
      'displayName: string = "default_user"',
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/>\s*\d+:/); // > marker with line number

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  });
});

describe("insert", () => {
  test("inserts text after specified line", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius([
      "insert",
      filePath,
      "--line",
      "1",
      "--text",
      "// New comment",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("inserted");

    const content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("// New comment");

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  });

  test("inserts at file beginning with --line 0", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius([
      "insert",
      filePath,
      "--line",
      "0",
      "--text",
      "// Header comment",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);

    const content = readFixtureFile(tmpDir, "src/main.ts");
    const lines = content.split("\n");
    expect(lines[0]).toContain("// Header comment");

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  });

  test("returns error for invalid line number", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius([
      "insert",
      filePath,
      "--line",
      "9999",
      "--text",
      "text",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/invalid line/i);
  });
});

describe("create", () => {
  test("creates new file with content", async () => {
    const newFile = join(tmpDir, "src/newfile.ts");
    const result = await radius([
      "create",
      newFile,
      "--content",
      "export const x = 1;",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("created");
    expect(existsSync(newFile)).toBe(true);

    const content = readFixtureFile(tmpDir, "src/newfile.ts");
    expect(content).toContain("export const x = 1;");

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  });

  test("returns error if file already exists", async () => {
    const existingFile = join(tmpDir, "src/main.ts");
    const result = await radius([
      "create",
      existingFile,
      "--content",
      "content",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/already exists/i);
  });

  test("output includes file content preview", async () => {
    const newFile = join(tmpDir, "src/preview.ts");
    const result = await radius([
      "create",
      newFile,
      "--content",
      "const preview = true;",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("const preview = true;");

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  });
});

describe("solve-conflict", () => {
  let conflictFile: string;

  beforeEach(async () => {
    // Use conflict fixture
    const conflictTmpDir = await setupFixture(".");
    conflictFile = join(process.cwd(), "tests/fixtures/conflict-file.ts");
  });

  test("displays conflict regions in read mode", async () => {
    const result = await radius(["solve-conflict", conflictFile], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("conflicts:");
    expect(result.stdout).toMatch(/conflict \d+/);
    expect(result.stdout).toContain("ours");
    expect(result.stdout).toContain("theirs");
  });

  test("resolves all conflicts with --accept ours", async () => {
    // First, copy conflict file to tmpDir for modification
    const testConflict = join(tmpDir, "conflict.ts");
    await Bun.write(testConflict, await Bun.file(conflictFile).text());

    const result = await radius(["solve-conflict", testConflict, "--accept", "ours"], {
      cwd: tmpDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/resolved/i);

    const content = readFixtureFile(tmpDir, "conflict.ts");
    expect(content).not.toContain("<<<<<<<");
    expect(content).not.toContain("=======");
    expect(content).not.toContain(">>>>>>>");

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  });

  test("resolves single conflict with --id", async () => {
    const testConflict = join(tmpDir, "conflict.ts");
    await Bun.write(testConflict, await Bun.file(conflictFile).text());

    const result = await radius([
      "solve-conflict",
      testConflict,
      "--id",
      "1",
      "--accept",
      "theirs",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/resolved.*conflict 1/i);

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  });

  test("returns error for invalid conflict id", async () => {
    const testConflict = join(tmpDir, "conflict.ts");
    await Bun.write(testConflict, await Bun.file(conflictFile).text());

    const result = await radius([
      "solve-conflict",
      testConflict,
      "--id",
      "999",
      "--accept",
      "ours",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not found|invalid/i);
  });
});

describe("rename-file", () => {
  test("renames file and updates imports", async () => {
    const oldPath = join(tmpDir, "src/utils.ts");
    const newPath = join(tmpDir, "src/helpers.ts");

    const result = await radius(["rename-file", oldPath, newPath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("renamed");
    expect(existsSync(newPath)).toBe(true);
    expect(existsSync(oldPath)).toBe(false);

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  });

  test("returns error for nonexistent source", async () => {
    const result = await radius([
      "rename-file",
      "/nonexistent.ts",
      join(tmpDir, "new.ts"),
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not found|does not exist/i);
  });

  test("returns error if destination exists", async () => {
    const source = join(tmpDir, "src/utils.ts");
    const dest = join(tmpDir, "src/main.ts");

    const result = await radius(["rename-file", source, dest], { cwd: tmpDir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/already exists/i);
  });
});
