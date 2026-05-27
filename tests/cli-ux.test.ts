/**
 * CLI UX improvements: --help handling, session auto-resolution, error hints.
 */

import { test, expect, describe, beforeAll, beforeEach, afterAll } from "bun:test";
import { radius } from "./helpers/radius";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { join } from "node:path";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { getActiveSessionPath } from "../src/shared/paths";

let tmpDir: string;

beforeAll(async () => {
  await radius(["ping"], { cwd: process.cwd() });
});

beforeEach(async () => {
  tmpDir = await setupFixture("ts-project");
  const sessionPath = getActiveSessionPath();
  if (existsSync(sessionPath)) {
    unlinkSync(sessionPath);
  }
});

afterAll(async () => {
  const sessionPath = getActiveSessionPath();
  if (existsSync(sessionPath)) {
    unlinkSync(sessionPath);
  }
});

describe("CLI --help", () => {
  test("create --help shows help instead of creating a file", async () => {
    const helpPath = join(tmpDir, "--help");

    const result = await radius(["create", "--help"], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("create");
    expect(result.stdout).toContain("Create a new file");
    expect(existsSync(helpPath)).toBe(false);
  }, 15_000);

  test("create-all --help shows bulk create docs", async () => {
    const result = await radius(["create-all", "--help"], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("create-all");
    expect(result.stdout).toContain("---");
  }, 15_000);
});

describe("create UX", () => {
  test("flag-like path is rejected with helpful error", async () => {
    const result = await radius(["create", "-foo.ts", "--content", "x"], { cwd: tmpDir });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/not a file path/i);
    expect(existsSync(join(tmpDir, "-foo.ts"))).toBe(false);
  }, 15_000);

  test("existing file error mentions --force", async () => {
    const existingFile = join(tmpDir, "src/main.ts");
    const result = await radius(["create", existingFile, "--content", "x"], { cwd: tmpDir });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/already exists|--force/i);
  }, 15_000);
});

describe("auto session", () => {
  const autoSessionEnv = { RADIUS_AUTO_SESSION: "1" };

  test("first command creates active-session file", async () => {
    const sessionPath = getActiveSessionPath();
    expect(existsSync(sessionPath)).toBe(false);

    const filePath = join(tmpDir, "src/main.ts");
    await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const auto: string = "default_user"'],
      { cwd: tmpDir, env: autoSessionEnv }
    );

    expect(existsSync(sessionPath)).toBe(true);
    expect(readFileSync(sessionPath, "utf-8").trim().length).toBeGreaterThan(0);

    await radius(["undo"], { cwd: tmpDir, env: autoSessionEnv });
  }, 30_000);

  test("undo works without --tag after auto session", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const s1: string = "default_user"'],
      { cwd: tmpDir, env: autoSessionEnv }
    );
    await radius(
      ["str-replace", filePath, "--old", 'const s1: string = "default_user"', "--new", 'const s2: string = "default_user"'],
      { cwd: tmpDir, env: autoSessionEnv }
    );

    const undoResult = await radius(["undo"], { cwd: tmpDir, env: autoSessionEnv });
    expect(undoResult.exitCode).toBe(0);
    expect(readFileSync(filePath, "utf-8")).toContain("s1");
  }, 30_000);
});

describe("str-replace hints", () => {
  test("multiple matches report line numbers", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(
      ["str-replace", filePath, "--old", "string", "--new", "text"],
      { cwd: tmpDir, skipAutoReason: true }
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/lines?\s+\d+/i);
  }, 15_000);
});
