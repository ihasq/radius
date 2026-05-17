/**
 * Part D: undo/redo テスト
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius, extractTag } from "./helpers/radius";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupFixture, cleanupFixture, readFixtureFile } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { existsSync } from "node:fs";
import { join } from "node:path";

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("history");
  await startDaemon();
});

afterAll(async () => {
  await stopDaemon();
  cleanupTestRadiusHome();
});

beforeEach(async () => {
  tmpDir = await setupFixture("ts-project");
});

afterEach(async () => {
  await cleanupFixture(tmpDir);
});

describe("undo/redo", () => {
  test("undo reverts str-replace", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const r1 = await radius(
      [
        "str-replace",
        filePath,
        "--old",
        'const userName: string = "default_user"',
        "--new",
        'const displayName: string = "default_user"',
      ],
      { cwd: tmpDir }
    );

    let content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("displayName");

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });

    content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("const userName");
    expect(content).not.toContain("displayName");
  });

  test("redo reapplies undone operation", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const r1 = await radius(
      [
        "str-replace",
        filePath,
        "--old",
        'const userName: string = "default_user"',
        "--new",
        'const displayName: string = "default_user"',
      ],
      { cwd: tmpDir }
    );

    const r2 = await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
    await radius(["redo", "--tag", extractTag(r2.stdout)], { cwd: tmpDir });

    const content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("displayName");

    // Cleanup not needed - session will be cleaned up by next test's setupFixture
  });

  test("undo with no history returns error", async () => {
    // 新しいフィクスチャで履歴なし
    const result = await radius(["undo"], { cwd: tmpDir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/nothing to undo|no history/i);
  });

  test("create undo deletes the file", async () => {
    const newFile = join(tmpDir, "src/temp.ts");

    const r1 = await radius(
      ["create", newFile, "--content", "const x = 1;"],
      { cwd: tmpDir }
    );

    expect(existsSync(newFile)).toBe(true);

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });

    expect(existsSync(newFile)).toBe(false);
  });

  test("rename-file undo restores original file", async () => {
    const oldPath = join(tmpDir, "src/utils.ts");
    const newPath = join(tmpDir, "src/helpers.ts");

    const r1 = await radius(
      ["rename-file", oldPath, newPath],
      { cwd: tmpDir }
    );

    expect(existsSync(newPath)).toBe(true);
    expect(existsSync(oldPath)).toBe(false);

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });

    expect(existsSync(oldPath)).toBe(true);
    expect(existsSync(newPath)).toBe(false);
  });

  test("multiple undo/redo operations maintain consistency", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 3つの操作を実行
    const r1 = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const name1: string = "default_user"'],
      { cwd: tmpDir }
    );
    const r2 = await radius(
      ["str-replace", filePath, "--old", 'const name1: string = "default_user"', "--new", 'const name2: string = "default_user"', "--tag", extractTag(r1.stdout)],
      { cwd: tmpDir }
    );
    const r3 = await radius(
      ["str-replace", filePath, "--old", 'const name2: string = "default_user"', "--new", 'const name3: string = "default_user"', "--tag", extractTag(r2.stdout)],
      { cwd: tmpDir }
    );

    let content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("name3");

    // 2回undo
    const r4 = await radius(["undo", "--tag", extractTag(r3.stdout)], { cwd: tmpDir });
    const r5 = await radius(["undo", "--tag", extractTag(r4.stdout)], { cwd: tmpDir });

    content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("name1");

    // 1回redo
    const r6 = await radius(["redo", "--tag", extractTag(r5.stdout)], { cwd: tmpDir });

    content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("name2");
  }, 30_000);

  test("redo with no redo history returns error", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const r1 = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const displayName: string = "default_user"'],
      { cwd: tmpDir }
    );

    // redoする前に新しい操作をすると、redoスタックがクリアされる
    const result = await radius(["redo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/nothing to redo|no history/i);
  });
});
