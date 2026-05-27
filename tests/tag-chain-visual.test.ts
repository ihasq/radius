/**
 * tag-chain-visual.test.ts
 *
 * Tests for tag chain visualization in command output.
 * Tags should be displayed with arrows showing the chain history.
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { radius } from "./helpers/radius";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { join } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import { getActiveSessionPath } from "../src/shared/paths";

let tmpDir: string;

function clearActiveSession(): void {
  const sessionPath = getActiveSessionPath();
  if (existsSync(sessionPath)) {
    unlinkSync(sessionPath);
  }
}

beforeAll(async () => {
  setupTestRadiusHome("tag-chain-visual");
  clearActiveSession();
  tmpDir = await setupFixture("ts-project");
});

beforeEach(() => {
  clearActiveSession();
});

afterAll(async () => {
  await cleanupFixture(tmpDir);
  clearActiveSession();
  cleanupTestRadiusHome();
});

describe("初回コマンド", () => {

  test("1. 初回出力にタグチェーンの説明が含まれること", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["view", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    // 初回コマンドは Welcome と --tag / RADIUS_SESSION の案内を含む
    expect(result.stdout).toMatch(/Welcome to Radius|Pass the latest.*--tag|set RADIUS_SESSION/i);
  }, 15000);

  test("2. 初回出力に --reason の案内が含まれること", async () => {
    const filePath = join(tmpDir, "src/utils.ts");
    const result = await radius(["outline", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/overriding another editor|--reason/i);
    // 初回は chain: 行も必要
    expect(result.stdout).toMatch(/chain:\s+[a-f0-9]{4}-[a-zA-Z0-9_-]+/);
  }, 15000);

  test("3. 初回出力に 'chain:' 行が含まれ、タグ1個であること", async () => {
    const filePath = join(tmpDir, "src/documented.ts");
    const result = await radius(["view", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    // chain: タグ1個
    expect(result.stdout).toMatch(/chain:\s+[a-f0-9]{4}-[a-zA-Z0-9_-]+/);
    // → 矢印はない（1個のみ）
    expect(result.stdout).not.toContain("→");
  }, 15000);

});

describe("2回目のコマンド", () => {

  test("4. 'chain:' 行に → 矢印で2個のタグが表示されること", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 1回目
    const r1 = await radius(["view", filePath], { cwd: tmpDir });
    const tag1Match = r1.stdout.match(/radius-tag:\s+([a-f0-9]{4}-[a-zA-Z0-9_-]+)/);
    expect(tag1Match).toBeTruthy();
    const tag1 = tag1Match![1];

    // 2回目
    const r2 = await radius(["outline", filePath, "--tag", tag1], { cwd: tmpDir });

    expect(r2.exitCode).toBe(0);
    // chain: tag1 → tag2
    expect(r2.stdout).toMatch(/chain:.*→/);
    // 2個のタグが表示される
    const chainLine = r2.stdout.match(/chain:.*$/m)?.[0];
    expect(chainLine).toBeTruthy();
    const arrowCount = (chainLine!.match(/→/g) || []).length;
    expect(arrowCount).toBe(1); // 2個のタグなら矢印1個
  }, 20000);

  test("5. 最新タグの下に ^^^^ マーカーがあること", async () => {
    const filePath = join(tmpDir, "src/utils.ts");

    const r1 = await radius(["view", filePath], { cwd: tmpDir });
    const tag1 = r1.stdout.match(/radius-tag:\s+([a-f0-9]{4}-[a-zA-Z0-9_-]+)/)?.[1];

    const r2 = await radius(["outline", filePath, "--tag", tag1!], { cwd: tmpDir });

    expect(r2.exitCode).toBe(0);
    // ^^^^ マーカー
    expect(r2.stdout).toMatch(/\^{4,}/);
    // "use this" テキスト
    expect(r2.stdout).toMatch(/use this/i);
  }, 20000);

  test("6. 初回の説明文が省略されていること", async () => {
    const filePath = join(tmpDir, "src/documented.ts");

    const r1 = await radius(["view", filePath], { cwd: tmpDir });
    const tag1 = r1.stdout.match(/radius-tag:\s+([a-f0-9]{4}-[a-zA-Z0-9_-]+)/)?.[1];

    const r2 = await radius(["outline", filePath, "--tag", tag1!], { cwd: tmpDir });

    expect(r2.exitCode).toBe(0);
    // 2回目では初回 Welcome 説明が省略される
    expect(r2.stdout).not.toMatch(/Welcome to Radius/i);
    // しかし chain: 行は表示される
    expect(r2.stdout).toMatch(/chain:.*→/);
  }, 20000);

});

describe("5回以上のコマンド", () => {

  test("7. 'chain:' 行に '...' 省略が含まれること", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 5回連続実行
    let tag = "";
    for (let i = 0; i < 5; i++) {
      const result = await radius(
        tag ? ["view", filePath, "--tag", tag] : ["view", filePath],
        { cwd: tmpDir }
      );
      const tagMatch = result.stdout.match(/radius-tag:\s+([a-f0-9]{4}-[a-zA-Z0-9_-]+)/);
      tag = tagMatch![1];
    }

    // 5回目の出力に ... 省略があること
    const r5 = await radius(["outline", filePath, "--tag", tag], { cwd: tmpDir });
    expect(r5.exitCode).toBe(0);
    expect(r5.stdout).toMatch(/chain:.*\.\.\./);
  }, 30000);

  test("8. 直近3個のタグのみ表示されること", async () => {
    const filePath = join(tmpDir, "src/utils.ts");

    // 6回連続実行
    let tag = "";
    for (let i = 0; i < 6; i++) {
      const result = await radius(
        tag ? ["view", filePath, "--tag", tag] : ["view", filePath],
        { cwd: tmpDir }
      );
      const tagMatch = result.stdout.match(/radius-tag:\s+([a-f0-9]{4}-[a-zA-Z0-9_-]+)/);
      tag = tagMatch![1];
    }

    // 6回目の出力: ...→ tag4 → tag5 → tag6 (3個の矢印)
    const chainLine = tag ? await radius(["outline", filePath, "--tag", tag], { cwd: tmpDir }) : null;
    expect(chainLine!.exitCode).toBe(0);
    const chain = chainLine!.stdout.match(/chain:.*$/m)?.[0];
    const arrowCount = (chain!.match(/→/g) || []).length;
    expect(arrowCount).toBe(3); // ...→ を含めて3個の矢印
  }, 40000);

  test("9. 最新タグの ^^^^ マーカーがあること", async () => {
    const filePath = join(tmpDir, "src/documented.ts");

    // 5回連続実行
    let tag = "";
    let lastResult;
    for (let i = 0; i < 5; i++) {
      lastResult = await radius(
        tag ? ["view", filePath, "--tag", tag] : ["view", filePath],
        { cwd: tmpDir }
      );
      const tagMatch = lastResult.stdout.match(/radius-tag:\s+([a-f0-9]{4}-[a-zA-Z0-9_-]+)/);
      tag = tagMatch![1];
    }

    expect(tag).toBeTruthy();
    expect(lastResult!.stdout).toMatch(/\^{4,}/); // ^^^^ マーカー
  }, 30000);

});

describe("新チェーン開始", () => {

  test("10. --reason 付きコマンド後、chain が新しい1個のみであること", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 既存チェーン作成（2回）
    const r1 = await radius(["view", filePath], { cwd: tmpDir });
    const tag1 = r1.stdout.match(/radius-tag:\s+([a-f0-9]{4}-[a-zA-Z0-9_-]+)/)?.[1];
    const r2 = await radius(["outline", filePath, "--tag", tag1!], { cwd: tmpDir });

    // chain: tag1 → tag2 が表示される
    expect(r2.stdout).toContain("→");

    // --reason で新チェーン開始
    const r3 = await radius(["view", filePath, "--reason", "override"], { cwd: tmpDir, skipAutoReason: true });

    expect(r3.exitCode).toBe(0);
    // chain: tag3 のみ（矢印なし）
    expect(r3.stdout).toMatch(/chain:\s+[a-f0-9]{4}-[a-zA-Z0-9_-]+/);
    expect(r3.stdout).not.toContain("→");
  }, 20000);

});
