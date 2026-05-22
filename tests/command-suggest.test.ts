/**
 * Phase 9: Command Suggestions Tests
 *
 * 10 tests covering:
 * - Group A: Suggestion content accuracy (T01-T05)
 * - Group B: Suggestion format accuracy (T06-T08)
 * - Group C: Conditional branching (T09-T10)
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { execSync, spawnSync } from "child_process";
import { mkdtempSync, cpSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let testDir: string;
let radiusCmd: string;

beforeAll(() => {
  // Create test fixture
  testDir = mkdtempSync(join(tmpdir(), "radius-suggest-test-"));
  cpSync(join(process.cwd(), "tests/fixtures/ts-project"), testDir, {
    recursive: true,
  });

  radiusCmd = join(process.cwd(), "dist/radius");

  // Kill any existing daemon
  try {
    execSync("pkill -9 -f daemon/main", { stdio: "ignore" });
  } catch {
    // Ignore if no daemon running
  }
});

afterAll(() => {
  // Cleanup
  try {
    execSync("pkill -9 -f daemon/main", { stdio: "ignore" });
  } catch {
    // Ignore
  }
  rmSync(testDir, { recursive: true, force: true });
});

describe("Group A: Suggestion content accuracy", () => {
  test("T01: str-replace with error → suggests 'radius fix'", () => {
    const file = join(testDir, "src/main.ts");

    // Introduce error by replacing valid code with invalid
    const result = spawnSync(
      radiusCmd,
      ["str-replace", file, "--old", "calc(r)", "--new", "undefined_func(r)"],
      { encoding: "utf-8" }
    );

    const output = result.stdout + result.stderr;
    expect(output).toContain("suggested:");
    expect(output).toContain("radius fix");
  });

  test("T02: str-replace without error → suggests 'radius problems'", () => {
    const file = join(testDir, "src/main.ts");

    // Clean replacement (add --reason to handle potential conflicts from T01)
    const result = spawnSync(
      radiusCmd,
      ["str-replace", file, "--old", "default_user", "--new", "test_user", "--reason", "testing clean replacement"],
      { encoding: "utf-8" }
    );

    const output = result.stdout + result.stderr;
    expect(output).toContain("suggested:");
    expect(output).toContain("radius problems");
  });

  test("T03: outline → suggests 'radius hover' with --line number", () => {
    const file = join(testDir, "src/main.ts");

    const result = spawnSync(radiusCmd, ["outline", file], {
      encoding: "utf-8",
    });

    const output = result.stdout + result.stderr;
    expect(output).toContain("suggested:");
    expect(output).toContain("radius hover");
    expect(output).toMatch(/--line \d+/);
  });

  test("T04: view → suggests 'radius outline'", () => {
    const file = join(testDir, "src/main.ts");

    const result = spawnSync(radiusCmd, ["view", file], { encoding: "utf-8" });

    const output = result.stdout + result.stderr;
    expect(output).toContain("suggested:");
    expect(output).toContain("radius outline");
  });

  test("T05: create-all → suggests 'radius view'", () => {
    const newFile = join(testDir, "src/new-file.ts");

    const result = spawnSync(
      radiusCmd,
      ["create-all", "--stdin"],
      {
        encoding: "utf-8",
        input: `--- ${newFile}\nexport const x = 1;`,
      }
    );

    const output = result.stdout + result.stderr;
    expect(output).toContain("suggested:");
    expect(output).toContain("radius view");
  });
});

describe("Group B: Suggestion format accuracy", () => {
  test("T06: suggested commands contain current tag", () => {
    const file = join(testDir, "src/main.ts");

    const result = spawnSync(radiusCmd, ["outline", file], {
      encoding: "utf-8",
    });

    const output = result.stdout + result.stderr;

    // Extract tag
    const tagMatch = output.match(/radius-tag: (\S+)/);
    expect(tagMatch).toBeTruthy();

    const tag = tagMatch![1];

    // Check suggested commands contain the tag
    const suggestedLines = output
      .split("\n")
      .filter((line) => line.includes("radius"));
    const hasSuggestionsWithTag = suggestedLines.some((line) =>
      line.includes(`--tag ${tag}`)
    );

    expect(hasSuggestionsWithTag).toBe(true);
  });

  test("T07: suggested commands are max 3", () => {
    const file = join(testDir, "src/main.ts");

    const result = spawnSync(radiusCmd, ["view", file], { encoding: "utf-8" });

    const output = result.stdout + result.stderr;

    // Count suggestions (lines starting with ">   radius")
    const suggestionCount = output
      .split("\n")
      .filter((line) => /^>\s+radius/.test(line)).length;

    expect(suggestionCount).toBeLessThanOrEqual(3);
  });

  test("T08: suggested command is executable (exit 0)", () => {
    const file = join(testDir, "src/main.ts");

    const result = spawnSync(radiusCmd, ["outline", file], {
      encoding: "utf-8",
    });

    const output = result.stdout + result.stderr;

    // Extract first suggestion
    const suggestionMatch = output.match(/>\s+(radius [^\n]+)/);
    expect(suggestionMatch).toBeTruthy();

    const suggestedCmd = suggestionMatch![1];

    // Try to execute it (should not crash)
    const execResult = spawnSync("bash", ["-c", suggestedCmd], {
      encoding: "utf-8",
      cwd: process.cwd(),
    });

    expect(execResult.status).toBe(0);
  });
});

describe("Group C: Conditional branching", () => {
  test("T09: problems with 0 errors → does NOT suggest 'radius fix'", () => {
    // Use a different file that hasn't been modified by other tests
    const file = join(testDir, "src/lib/helpers.ts");

    const result = spawnSync(radiusCmd, ["problems", file], {
      encoding: "utf-8",
    });

    const output = result.stdout + result.stderr;

    // Should have suggestions but NOT fix
    if (output.includes("suggested:")) {
      expect(output).not.toContain("radius fix");
    }
  });

  test("T10: problems with N errors → suggests 'radius fix'", () => {
    const file = join(testDir, "src/main.ts");

    // Introduce error by replacing valid function call with undefined one
    spawnSync(
      radiusCmd,
      ["str-replace", file, "--old", "data.join", "--new", "data.undefinedMethod", "--reason", "testing error detection"],
      { encoding: "utf-8" }
    );

    const result = spawnSync(radiusCmd, ["problems", file], {
      encoding: "utf-8",
    });

    const output = result.stdout + result.stderr;
    expect(output).toContain("suggested:");
    expect(output).toContain("radius fix");
  });
});
