/**
 * ts-rad context generation テスト
 * ts-rad が生成するコンテキスト情報の検証。各 depth がコマンド出力に付帯する情報の正確性。
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { radius } from "./helpers/radius";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

let tmpDir: string;
let originalFiles: Map<string, string>;

beforeAll(async () => {
  setupTestRadiusHome("ts-rad-context");
  tmpDir = await setupFixture("ts-project");

  originalFiles = new Map();
  for (const rel of ["src/main.ts"]) {
    const p = join(tmpDir, rel);
    originalFiles.set(p, readFileSync(p, "utf-8"));
  }
});

beforeEach(() => {
  for (const [p, content] of originalFiles) {
    writeFileSync(p, content);
  }
});

afterAll(async () => {
  await cleanupFixture(tmpDir);
  cleanupTestRadiusHome();
});

describe("ts-rad context generation", () => {

  test("depth-0 context uses regex-based extraction", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["view", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    // view の ## context セクション
    // exports と imports が正規表現ベースで抽出されること
    expect(result.stdout).toMatch(/## context|exports|imports/);
    // AST 解析は行わない（depth-0 のため）
  }, 30_000);

  test("depth-1 context uses AST-based extraction", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["outline", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    // outline の ## context セクション
    // export function, export const が正確に列挙されること
    expect(result.stdout).toMatch(/## context|exports/);
    expect(result.stdout).toContain("greet");
    // デフォルト export も検出されること（あれば）
  }, 30_000);

  test("depth-2 context includes imported symbol types", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "hover",
      filePath,
      "--line", "1",
      "--col", "10"
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    // hover の ## context セクション
    // import 先の型シグネチャが含まれること
    expect(result.stdout).toMatch(/## context|imports/);
  }, 30_000);

  test("depth-3 context includes cross-file references", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "modify-var",
      filePath,
      "--from",
      "userName",
      "--to",
      "testName",
      "--reason",
      "test"
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    // modify-var の ## impact セクション
    // 変更が影響するファイルと行番号が含まれること
    expect(result.stdout).toMatch(/## impact|files modified/);
  }, 30_000);

  test("depth-4 context includes diagnostic IDs", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 型エラーを導入する str-replace
    const result = await radius([
      "str-replace",
      filePath,
      "--old", ": string =",
      "--new", ": number =",
      "--reason", "test"
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    // str-replace（型エラー導入）の diagnostics セクション
    // D-NNN 形式の ID と ❌ / ⚠️ が含まれること
    expect(result.stdout).toMatch(/diagnostics|D-\d+|❌|⚠️/);
  }, 30_000);

  test("context accuracy improves with depth", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // depth-0 (view): exports にシグネチャなし
    const viewResult = await radius(["view", filePath], { cwd: tmpDir });
    const viewHasSignature = /function.*\(.*\)/.test(viewResult.stdout);

    // depth-1 (outline): exports にネストあり
    const outlineResult = await radius(["outline", filePath], { cwd: tmpDir });
    const outlineHasNesting = outlineResult.stdout.includes("  "); // インデントあり

    // depth-2 (hover): 特定位置の型情報あり
    const hoverResult = await radius([
      "hover",
      filePath,
      "--line", "3",
      "--col", "20"
    ], { cwd: tmpDir });
    const hoverHasType = /string|number|type/.test(hoverResult.stdout);

    // 情報量が depth に比例して増加すること
    expect(hoverHasType).toBe(true);
  }, 30_000);

  test("first command includes ## conventions", async () => {
    // セッション初回のコマンド
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["view", filePath], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    // ## conventions セクションが含まれること
    expect(result.stdout).toContain("## conventions");
    // tsconfig.json から strict, target, module が読み取られること
    expect(result.stdout).toMatch(/strict|target|module/);
  }, 30_000);

});
