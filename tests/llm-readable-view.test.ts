/**
 * LLM可読ビュー改善テスト
 * Phase C: AUDIT_LLM_STDOUT.md の10件の不備を検証
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { radius } from "./helpers/radius";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { join } from "node:path";

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("llm-readable-view");
  tmpDir = await setupFixture("ts-project");
});

afterAll(async () => {
  await cleanupFixture(tmpDir);
  cleanupTestRadiusHome();
});

// ================================================
// Group 1: diagnostics (不備2,3)
// ================================================

describe("Group 1: diagnostics", () => {

  test("T01: str-replace 正常時に '0 errors, 0 warnings' を含む", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius([
      "str-replace",
      filePath,
      "--old",
      "export const userName: string = \"default_user\";",
      "--new",
      "export const userName: string = \"default_user\";",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/diagnostics:.*ok.*0 errors.*0 warnings/i);
  }, 15000);

  test("T02: str-replace エラー導入時に 'Do NOT proceed' を含む", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius([
      "str-replace",
      filePath,
      "--old",
      "export const userName: string = \"default_user\";",
      "--new",
      "export const userName: number = \"invalid\";",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Do NOT proceed/i);

    // クリーンアップ: 変更を元に戻す
    await radius([
      "str-replace",
      filePath,
      "--old",
      "export const userName: number = \"invalid\";",
      "--new",
      "export const userName: string = \"default_user\";",
    ], { cwd: tmpDir });
  }, 15000);

  test("T03: 非TSファイルで 'skipped' を含む（'unavailable' でない）", async () => {
    const filePath = join(tmpDir, "package.json");
    const result = await radius([
      "str-replace",
      filePath,
      "--old",
      '"name": "ts-project"',
      "--new",
      '"name": "ts-project"',
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/skipped/i);
    expect(result.stdout).not.toMatch(/unavailable/i);
  }, 15000);

});

// ================================================
// Group 2: context (不備4)
// ================================================

describe("Group 2: context", () => {

  test("T04: exports に ':' を含む型注釈がある", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["view", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    // exports に型シグネチャが含まれる（例: userName: string）
    const contextSection = result.stdout.match(/## context[\s\S]*?---/)?.[0] || "";
    expect(contextSection).toMatch(/exports:[\s\S]*:/);
  }, 15000);

  test("T05: exports に '(variable' または '(function' のシンボル種別がある", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["view", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    const contextSection = result.stdout.match(/## context[\s\S]*?---/)?.[0] || "";
    expect(contextSection).toMatch(/\((variable|function|class|interface)/);
  }, 15000);

  test("T06: exports に 'line' を含む行番号がある", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["view", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    const contextSection = result.stdout.match(/## context[\s\S]*?---/)?.[0] || "";
    expect(contextSection).toMatch(/line \d+/);
  }, 15000);

});

// ================================================
// Group 3: conventions (不備5)
// ================================================

describe("Group 3: conventions", () => {

  test("T07: strict: true 時に 'MUST' を含む注釈がある", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["view", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    const conventionsSection = result.stdout.match(/## conventions[\s\S]*?---/)?.[0] || "";
    if (conventionsSection.includes("strict: true")) {
      expect(conventionsSection).toMatch(/MUST/);
    }
  }, 15000);

  test("T08: target に 'do NOT' を含む注釈がある", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["view", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    const conventionsSection = result.stdout.match(/## conventions[\s\S]*?---/)?.[0] || "";
    expect(conventionsSection).toMatch(/target:.*do NOT/i);
  }, 15000);

});

// ================================================
// Group 4: view (不備6)
// ================================================

describe("Group 4: view", () => {

  test("T09: view 出力の先頭に行数が含まれる", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["view", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    // 先頭に "view: <path> (XX lines, ...)" の形式
    expect(result.stdout).toMatch(/view:.*\(\d+ lines/i);
  }, 15000);

  test("T10: view 出力の先頭に export 数が含まれる", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["view", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/view:.*\d+ exports/i);
  }, 15000);

});

// ================================================
// Group 5: outline (不備7)
// ================================================

describe("Group 5: outline", () => {

  test("T11: outline のシンボルに戻り値型がある", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["outline", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    // 関数に戻り値型が含まれる（例: greet(): string）
    expect(result.stdout).toMatch(/function \w+\([^)]*\):\s*\w+/);
  }, 15000);

  test("T12: outline のシンボルに 'uses:' 依存情報がある", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["outline", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    // 少なくとも1つのシンボルに uses: が含まれる
    expect(result.stdout).toMatch(/uses:/);
  }, 15000);

});

// ================================================
// Group 6: problems (不備9)
// ================================================

describe("Group 6: problems", () => {

  test("T13: problems 正常時に '0 errors, 0 warnings' を含む", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["problems", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/0 errors.*0 warnings/i);
  }, 15000);

});

// ================================================
// Group 7: welcome (不備10)
// ================================================

describe("Group 7: welcome", () => {

  test("T14: 初回コマンドに 'Welcome to Radius' を含む", async () => {
    // 新しいフィクスチャで初回実行をシミュレート
    const newTmpDir = await setupFixture("ts-project");
    setupTestRadiusHome("llm-welcome-first");

    const filePath = join(newTmpDir, "src/main.ts");
    const result = await radius(["view", filePath], { cwd: newTmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Welcome to Radius/i);

    await cleanupFixture(newTmpDir);
    cleanupTestRadiusHome();
  }, 15000);

  test("T15: 2回目コマンドに 'Welcome' を含まない", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 1回目
    const r1 = await radius(["view", filePath], { cwd: tmpDir });
    const tag1 = r1.stdout.match(/radius-tag:\s+([a-f0-9]{4}-[a-zA-Z0-9_-]+)/)?.[1];

    // 2回目
    const r2 = await radius(["view", filePath, "--tag", tag1!], { cwd: tmpDir });

    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).not.toMatch(/Welcome to Radius/i);
  }, 15000);

});
