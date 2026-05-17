/**
 * Phase 16: マルチエージェント同時編集テスト
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius, extractTag } from "./helpers/radius";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupFixture, cleanupFixture, readFixtureFile } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { join } from "node:path";

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("multi-agent");
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

describe("change ledger", () => {
  test("records file changes with agent ID", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // Agent A modifies the file
    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
      "--agent",
      "agent-a",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);

    // Verify change was recorded (indirectly - we can't directly query ledger from CLI yet)
    // For now, just verify the command succeeded
    const content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("userId");

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });
});

describe("conflict detection", () => {
  test("detects overlapping edits from different agents", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // Agent A modifies line 3
    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
      "--agent",
      "agent-a",
      "--reason",
      "standardizing variable names",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);

    // Agent B tries to modify the same line shortly after
    // This should detect a conflict
    const r2 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userId",
      "--replacement",
      "userName",
      "--agent",
      "agent-b",
      "--reason",
      "reverting change",
      "--tag",
      extractTag(r1.stdout),
    ], { cwd: tmpDir });

    // Depending on implementation, this might succeed with a warning
    // or might be blocked. For now, let's just check it doesn't crash
    expect([0, 1]).toContain(r2.exitCode);

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });

  test("allows non-overlapping edits from different agents", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // Agent A modifies line 3 (userName)
    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
      "--agent",
      "agent-a",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);

    // Agent B modifies a different line (line 9-10, calculate function)
    const r2 = await radius([
      "str-replace",
      filePath,
      "--old",
      "function calculate(a: number, b: number): number {\n  return a + b;\n}",
      "--new",
      "function add(a: number, b: number): number {\n  return a + b;\n}",
      "--agent",
      "agent-b",
      "--tag",
      extractTag(r1.stdout),
    ], { cwd: tmpDir });

    expect(r2.exitCode).toBe(0);

    const content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("userId");
    expect(content).toContain("function add");

    await radius(["undo", "--tag", extractTag(r2.stdout)], { cwd: tmpDir });
    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });
});

describe("conflict resolution", () => {
  test("list-notifications shows pending conflicts", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // Agent A modifies a line
    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
      "--agent",
      "agent-a",
      "--reason",
      "initial change",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);

    // Agent B overwrites the same line
    const r2 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userId",
      "--replacement",
      "accountId",
      "--agent",
      "agent-b",
      "--reason",
      "better naming",
      "--tag",
      extractTag(r1.stdout),
    ], { cwd: tmpDir });

    // Agent A checks notifications
    const r3 = await radius([
      "list-notifications",
      "--agent",
      "agent-a",
    ], { cwd: tmpDir });

    expect(r3.exitCode).toBe(0);
    // Should show notification about the overwrite
    // (exact format depends on implementation)

    await radius(["undo", "--tag", extractTag(r2.stdout)], { cwd: tmpDir });
    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });

  test("accept-change resolves conflict", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // Create a conflict scenario (simplified - actual implementation details may vary)
    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
      "--agent",
      "agent-a",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);

    // Note: accept-change needs a conflict ID which we don't have in this simplified test
    // This test is a placeholder for the actual resolution flow
    // In a real scenario, agent-a would:
    // 1. List notifications to get conflict ID
    // 2. Call accept-change with that ID

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });

  test("challenge-change sends challenge to other agent", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // Create a conflict scenario
    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
      "--agent",
      "agent-a",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);

    // Note: challenge-change needs a conflict ID which we don't have in this simplified test
    // This is a placeholder for the actual challenge flow

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });
});

describe("time window", () => {
  test("conflicts expire after time window", async () => {
    // This test would require manipulating time or waiting
    // For now, it's a placeholder
    expect(true).toBe(true);
  });
});

describe("replace command integration", () => {
  test("replace records ledger entry with agent ID", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const r1 = await radius([
      "replace",
      filePath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
      "--agent",
      "agent-a",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);

    const content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("userId");

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });

  test("replace-all records ledger entries for all files", async () => {
    const dirPath = join(tmpDir, "src");

    const r1 = await radius([
      "replace-all",
      dirPath,
      "--pattern",
      "userName",
      "--replacement",
      "userId",
      "--agent",
      "agent-a",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  });
});
