/**
 * Phase 15: 検索・置換・一括置換テスト
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius, extractTag } from "./helpers/radius";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupFixture, cleanupFixture, readFixtureFile } from "./helpers/fixtures";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

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

describe("grep", () => {
  test("finds literal matches in single file", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "grep",
      filePath,
      "--pattern",
      "userName",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("search:");
    expect(result.stdout).toContain("matches:");
    expect(result.stdout).toContain("userName");
    expect(result.stdout).toContain("src/main.ts:");
  });

  test("finds matches across directory", async () => {
    const dirPath = join(tmpDir, "src");

    const result = await radius([
      "grep",
      dirPath,
      "--pattern",
      "userName",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("src/main.ts:");
    expect(result.stdout).toContain("src/utils.ts:");
  });

  test("--regex enables regex matching", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "grep",
      filePath,
      "--pattern",
      "user\\w+",
      "--regex",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("userName");
  });

  test("--ignore-case enables case insensitive matching", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "grep",
      filePath,
      "--pattern",
      "USERNAME",
      "--ignore-case",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("userName");
  });

  test("--max-results limits output", async () => {
    const dirPath = join(tmpDir, "src");

    const result = await radius([
      "grep",
      dirPath,
      "--pattern",
      "function",
      "--max-results",
      "2",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/matches: [1-2]/);
  });

  test("returns no matches message for unmatched pattern", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "grep",
      filePath,
      "--pattern",
      "nonexistentPattern",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("matches: 0");
    expect(result.stdout).toContain("no matches found");
  });

  test("invalid regex returns error", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "grep",
      filePath,
      "--pattern",
      "[invalid",
      "--regex",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/invalid regex/i);
  });
});

describe("replace", () => {
  test("replaces all matches in file", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toContain("replaced");
    expect(r1.stdout).toContain("occurrence");

    const content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("userId");
    expect(content).not.toContain("userName:");

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });

  test("--regex with capture groups", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // userName → userId (Nameを取り除いてIdに置換)
    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "(\\w+)Name",
      "--replacement",
      "$1Id",
      "--regex",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);

    const content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("userId");
    expect(content).not.toContain("userName:");

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });

  test("--ignore-case replaces case-insensitively", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "USERNAME",
      "--replacement",
      "userId",
      "--ignore-case",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);

    const content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("userId");

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });

  test("--max limits replacements", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
      "--max",
      "1",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toContain("replaced 1 occurrence");

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });

  test("--stdin accepts JSON input", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const stdinData = JSON.stringify({
      pattern: "userName",
      replacement: "userId",
      regex: false,
      ignoreCase: false,
    });

    const r1 = await radius([
      "replace",
      filePath,
      "--stdin",
    ], { cwd: tmpDir, stdin: stdinData });

    expect(r1.exitCode).toBe(0);

    const content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("userId");

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });

  test("replacement $ is literal when --regex not set", async () => {
    const testFile = join(tmpDir, "src/test-dollar.ts");
    writeFileSync(testFile, "const price = 10;\n");

    const r1 = await radius([
      "create",
      testFile,
      "--content",
      "const price = 10;",
    ], { cwd: tmpDir });

    const r2 = await radius([
      "replace",
      testFile,
      "--pattern",
      "10",
      "--replacement",
      "$100",
      "--tag",
      extractTag(r1.stdout),
    ], { cwd: tmpDir });

    expect(r2.exitCode).toBe(0);

    const content = readFixtureFile(tmpDir, "src/test-dollar.ts");
    expect(content).toContain("$100");

    const r3 = await radius(["undo", "--tag", extractTag(r2.stdout)], { cwd: tmpDir });
    await radius(["undo", "--tag", extractTag(r3.stdout)], { cwd: tmpDir });
  });

  test("undo reverts all replacements", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const beforeContent = readFixtureFile(tmpDir, "src/main.ts");

    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
    ], { cwd: tmpDir });

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });

    const afterContent = readFixtureFile(tmpDir, "src/main.ts");
    expect(afterContent).toBe(beforeContent);
  });

  test("diagnostics returned after replace", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toContain("diagnostics:");

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });

  test("zero matches returns error", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "replace",
      filePath,
      "--pattern",
      "nonexistentPattern",
      "--replacement",
      "replacement",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no matches/i);
  });
});

describe("replace-all", () => {
  test("replaces across multiple files", async () => {
    const dirPath = join(tmpDir, "src");

    const r1 = await radius([
      "replace-all",
      dirPath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toContain("files scanned:");
    expect(r1.stdout).toContain("files modified:");
    expect(r1.stdout).toContain("total replacements:");

    const mainContent = readFixtureFile(tmpDir, "src/main.ts");
    const utilsContent = readFixtureFile(tmpDir, "src/utils.ts");

    expect(mainContent).toContain("userId");
    expect(utilsContent).toContain("userId");

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });

  test("--include filters file types", async () => {
    const dirPath = join(tmpDir, "src");

    // lib/helpers.ts を作成
    writeFileSync(
      join(tmpDir, "src/lib/helpers.ts"),
      "const userName = 'test';"
    );

    const r1 = await radius([
      "replace-all",
      dirPath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
      "--include",
      "*.ts",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toMatch(/files modified:\s*[3-9]/); // 最低3ファイル

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });

  test("--exclude skips matched files", async () => {
    const dirPath = join(tmpDir, "src");

    const r1 = await radius([
      "replace-all",
      dirPath,
      "--pattern",
      "function",
      "--replacement",
      "fn",
      "--exclude",
      "utils.ts",
    ], { cwd: tmpDir });

    // utils.ts が除外されているため、変更されていない
    const utilsContent = readFixtureFile(tmpDir, "src/utils.ts");
    expect(utilsContent).toContain("function");

    if (r1.exitCode === 0) {
      await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
    }
  });

  test("single changeset for all files", async () => {
    const dirPath = join(tmpDir, "src");

    const r1 = await radius([
      "replace-all",
      dirPath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);

    // 1回のundoで全ファイルが元に戻る
    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });

    const mainContent = readFixtureFile(tmpDir, "src/main.ts");
    const utilsContent = readFixtureFile(tmpDir, "src/utils.ts");

    expect(mainContent).toContain("userName");
    expect(utilsContent).toContain("userName");
  });

  test("undo reverts all files in one operation", async () => {
    const dirPath = join(tmpDir, "src");

    const beforeMain = readFixtureFile(tmpDir, "src/main.ts");
    const beforeUtils = readFixtureFile(tmpDir, "src/utils.ts");

    const r1 = await radius([
      "replace-all",
      dirPath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
    ], { cwd: tmpDir });

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });

    const afterMain = readFixtureFile(tmpDir, "src/main.ts");
    const afterUtils = readFixtureFile(tmpDir, "src/utils.ts");

    expect(afterMain).toBe(beforeMain);
    expect(afterUtils).toBe(beforeUtils);
  });

  test("node_modules always excluded", async () => {
    // node_modules ディレクトリを作成
    const nodeModulesDir = join(tmpDir, "node_modules");
    const testFile = join(nodeModulesDir, "test.ts");

    // ディレクトリを手動で作成
    require("node:fs").mkdirSync(nodeModulesDir, { recursive: true });
    writeFileSync(testFile, "const userName = 'test';");

    const r1 = await radius([
      "replace-all",
      tmpDir,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);

    // node_modules 内のファイルは変更されていない
    const nmContent = require("node:fs").readFileSync(testFile, "utf-8");
    expect(nmContent).toContain("userName");

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });
});
