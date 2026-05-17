/**
 * Phase 16: マルチエージェント・エンドツーエンドテスト
 *
 * ユーザー要求の5ステップシナリオを検証:
 * 1. A が編集
 * 2. B が重複箇所を編集（拒否される）
 * 3. B が --reason 付きで再実行
 * 4. A が次のコマンドで通知を受信
 * 5. A が accept
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius, extractTag } from "./helpers/radius";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupFixture, cleanupFixture, readFixtureFile } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { join } from "node:path";

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("multi-agent-e2e");
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

describe("Phase 16 エンドツーエンド検証", () => {
  test("5-step conflict resolution scenario", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // Step 1: Chain A が編集（tagなし初回）
    console.log("\n=== Step 1: Chain A edits file ===");
    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
    ], { cwd: tmpDir });

    console.log("stdout:", r1.stdout);
    console.log("stderr:", r1.stderr);
    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toContain("replaced");
    const tagA1 = extractTag(r1.stdout);

    // 変更を確認
    const content1 = readFixtureFile(tmpDir, "src/main.ts");
    expect(content1).toContain("userId");
    expect(content1).not.toContain("userName:");

    // Step 2 & 3: Chain B が重複箇所を編集（tagなし初回=別chainId）
    console.log("\n=== Step 2: Chain B edits (conflict will be recorded post-write) ===");
    const r2 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userId",
      "--replacement",
      "accountId",
      "--reason",
      "improving naming consistency",
    ], { cwd: tmpDir });

    console.log("stdout:", r2.stdout);
    console.log("stderr:", r2.stderr);
    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toContain("replaced");

    // ファイルが変更されていることを確認
    const content2 = readFixtureFile(tmpDir, "src/main.ts");
    expect(content2).toContain("accountId");
    expect(content2).not.toContain("userId:");

    const tagB1 = extractTag(r2.stdout);

    // Step 4: Chain A が次のコマンドで通知を受信（自分のtagチェーンを使用）
    console.log("\n=== Step 4: Chain A receives notification ===");
    const r4 = await radius([
      "view",
      filePath,
      "--tag",
      tagA1,
    ], { cwd: tmpDir });

    console.log("stdout:", r4.stdout);
    console.log("stderr:", r4.stderr);
    expect(r4.exitCode).toBe(0);
    expect(r4.stdout).toContain("pending notification");
    expect(r4.stdout).toContain("overwrite");

    // Step 5: Chain A が通知を確認して accept
    console.log("\n=== Step 5: Chain A lists and accepts conflict ===");

    // まず通知リストを取得してconflict IDを抽出（Chain Aのtagで）
    const r5a = await radius([
      "list-notifications",
      "--tag",
      tagA1,
    ], { cwd: tmpDir });

    console.log("notifications stdout:", r5a.stdout);
    expect(r5a.exitCode).toBe(0);
    expect(r5a.stdout).toContain("pending notifications");

    // conflict ID を抽出（簡易パーサー）
    const conflictIdMatch = r5a.stdout.match(/conflict:\s*(conflict-\S+)/);
    expect(conflictIdMatch).toBeTruthy();
    const conflictId = conflictIdMatch![1];

    console.log("Extracted conflict ID:", conflictId);

    // accept を実行（Chain Aのtagで）
    const r5b = await radius([
      "accept-change",
      "--conflict",
      conflictId,
      "--tag",
      tagA1,
    ], { cwd: tmpDir });

    console.log("accept stdout:", r5b.stdout);
    console.log("accept stderr:", r5b.stderr);
    expect(r5b.exitCode).toBe(0);
    expect(r5b.stdout).toContain("accepted");
    expect(r5b.stdout).toContain("resolved");

    // 通知がクリアされたことを確認（Chain Aのtagで）
    const tagA2 = extractTag(r5b.stdout);
    const r6 = await radius([
      "list-notifications",
      "--tag",
      tagA2,
    ], { cwd: tmpDir });

    console.log("final notifications:", r6.stdout);
    expect(r6.exitCode).toBe(0);
    expect(r6.stdout).toContain("no pending notifications");

    // クリーンアップ（各chainの最新tagでundo）
    await radius(["undo", "--tag", tagB1], { cwd: tmpDir });
    await radius(["undo", "--tag", tagA2], { cwd: tmpDir });
  }, 30_000);

  test("challenge flow", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // Chain A が編集（tagなし初回）
    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);
    const tagA1 = extractTag(r1.stdout);

    // Chain B が --reason 付きで上書き（tagなし初回=別chainId）
    const r2 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userId",
      "--replacement",
      "accountId",
      "--reason",
      "better naming",
    ], { cwd: tmpDir });

    expect(r2.exitCode).toBe(0);
    const tagB1 = extractTag(r2.stdout);

    // Chain A が通知を受け取り、challenge を送る
    const r3 = await radius([
      "list-notifications",
      "--tag",
      tagA1,
    ], { cwd: tmpDir });

    expect(r3.exitCode).toBe(0);
    const conflictIdMatch = r3.stdout.match(/conflict:\s*(conflict-\S+)/);
    expect(conflictIdMatch).toBeTruthy();
    const conflictId = conflictIdMatch![1];

    // Challenge を送信（Chain Aのtagで）
    const r4 = await radius([
      "challenge-change",
      "--conflict",
      conflictId,
      "--reason",
      "this breaks existing tests",
      "--tag",
      tagA1,
    ], { cwd: tmpDir });

    console.log("challenge stdout:", r4.stdout);
    expect(r4.exitCode).toBe(0);
    expect(r4.stdout).toContain("challenge sent");

    // Chain B が challenge 通知を受け取る
    const r5 = await radius([
      "list-notifications",
      "--tag",
      tagB1,
    ], { cwd: tmpDir });

    console.log("chain-b notifications:", r5.stdout);
    expect(r5.exitCode).toBe(0);
    expect(r5.stdout).toContain("challenge");

    // クリーンアップ
    await radius(["undo", "--tag", tagB1], { cwd: tmpDir });
    await radius(["undo", "--tag", tagA1], { cwd: tmpDir });
  }, 30_000);
});
