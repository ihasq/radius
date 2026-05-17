/**
 * Part D: ドッグタグテスト
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius, extractTag } from "./helpers/radius";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupFixture, cleanupFixture, readFixtureFile } from "./helpers/fixtures";
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

describe("dog tag", () => {
  test("output includes radius-tag", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(
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

    expect(result.stdout).toMatch(/radius-tag:\s*\w{4}-\w+/);

    await radius(["undo"], { cwd: tmpDir });
  });

  test("rewind detection triggers auto-undo", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 1. 最初の操作
    const r1 = await radius(
      [
        "str-replace",
        filePath,
        "--old",
        'const userName: string = "default_user"',
        "--new",
        'const name1: string = "default_user"',
      ],
      { cwd: tmpDir }
    );
    const tag1 = extractTag(r1.stdout);

    // 2. 二番目の操作
    const r2 = await radius(
      [
        "str-replace",
        filePath,
        "--old",
        'const name1: string = "default_user"',
        "--new",
        'const name2: string = "default_user"',
        "--tag",
        tag1,
      ],
      { cwd: tmpDir }
    );
    const tag2 = extractTag(r2.stdout);

    let content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("name2");

    // 3. 巻き戻り: tag1 を再送信
    const r3 = await radius(
      ["view", filePath, "--tag", tag1],
      { cwd: tmpDir }
    );

    expect(r3.stdout).toMatch(/warning.*rewind/i);

    // ファイルは name1 の状態に戻っているはず（name2 → name1 にundo）
    content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("name1");
    expect(content).not.toContain("name2");

    await radius(["undo"], { cwd: tmpDir });
  });

  test("unknown tag produces warning", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(
      ["view", filePath, "--tag", "xxxx-INVALID0"],
      { cwd: tmpDir }
    );

    expect(result.stdout).toMatch(/unknown tag|warning/i);
  });

  test("consecutive operations with tags maintain sequence", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 操作チェーン
    const r1 = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const step1: string = "default_user"'],
      { cwd: tmpDir }
    );
    const tag1 = extractTag(r1.stdout);

    const r2 = await radius(
      ["str-replace", filePath, "--old", 'const step1: string = "default_user"', "--new", 'const step2: string = "default_user"', "--tag", tag1],
      { cwd: tmpDir }
    );
    const tag2 = extractTag(r2.stdout);

    const r3 = await radius(
      ["str-replace", filePath, "--old", 'const step2: string = "default_user"', "--new", 'const step3: string = "default_user"', "--tag", tag2],
      { cwd: tmpDir }
    );
    const tag3 = extractTag(r3.stdout);

    const content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("step3");

    // Cleanup
    await radius(["undo"], { cwd: tmpDir });
    await radius(["undo"], { cwd: tmpDir });
    await radius(["undo"], { cwd: tmpDir });
  });

  test("read-only commands return same tag", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 最初の書き込み操作
    const r1 = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const displayName: string = "default_user"'],
      { cwd: tmpDir }
    );
    const tag1 = extractTag(r1.stdout);

    // 読み取り専用コマンド
    const r2 = await radius(
      ["view", filePath, "--tag", tag1],
      { cwd: tmpDir }
    );
    const tag2 = extractTag(r2.stdout);

    // 同じタグが返されるはず
    expect(tag2).toBe(tag1);

    await radius(["undo"], { cwd: tmpDir });
  });

  test("tag format is valid", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const displayName: string = "default_user"'],
      { cwd: tmpDir }
    );

    const tag = extractTag(result.stdout);

    // タグフォーマット: <4char>-<8+char>
    expect(tag).toMatch(/^[a-zA-Z0-9]{4}-[a-zA-Z0-9_\-]{8,}$/);

    await radius(["undo"], { cwd: tmpDir });
  });
});
