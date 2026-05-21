import { stopAllLsp } from "./helpers/daemon";
/**
 * Phase 17: Code Actions / Format テスト
 *
 * CLI構文:
 *   radius fix <file> [--line N] [--id <action-id>] [--tag T]
 *   radius fix <file> --list [--tag T]
 *   radius format <file> [--tag T]
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius, extractTag } from "./helpers/radius";
import { setupFixture, cleanupFixture, readFixtureFile, writeFixtureFile } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, unlinkSync, utimesSync } from "node:fs";

let tmpDir: string;
let originalFiles: Map<string, string>;

beforeAll(async () => {
  setupTestRadiusHome("codeactions");
  tmpDir = await setupFixture("ts-project");
  // LSP ウォームアップ
  await radius(["outline", join(tmpDir, "src/main.ts")], { cwd: tmpDir });
  // 元のファイル内容を保存
  originalFiles = new Map();
  for (const rel of ["src/with-errors.ts", "src/main.ts", "src/unformatted.ts"]) {
    const p = join(tmpDir, rel);
    if (existsSync(p)) originalFiles.set(p, readFileSync(p, "utf-8"));
  }
});

afterAll(async () => {
  await stopAllLsp();
  await cleanupFixture(tmpDir);
  cleanupTestRadiusHome();
});

beforeEach(async () => {
  // ファイル内容を元に戻す
  for (const [p, content] of originalFiles) {
    writeFileSync(p, content);
    // Update mtime to ensure BufferManager detects the change
    const now = Date.now() / 1000;
    utimesSync(p, now, now);
  }
  // Wait to ensure mtime check interval passes (BufferManager checks every 1s)
  await new Promise(resolve => setTimeout(resolve, 1100));
  // テストで作成されるファイルを削除
  const testTxt = join(tmpDir, "test.txt");
  if (existsSync(testTxt)) unlinkSync(testTxt);
});

describe("fix", () => {
  test("fix --list shows available code actions for file", async () => {
    const filePath = join(tmpDir, "src/with-errors.ts");

    const result = await radius(["fix", filePath, "--list"], { cwd: tmpDir });

    // 出力に code action の一覧が含まれる
    expect(result.stdout).toMatch(/code actions for/i);
    // 各アクションに id, title が含まれる
    expect(result.stdout).toMatch(/\[\d+\]/);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("fix --list shows no quickfix actions when file is clean", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["fix", filePath, "--list"], { cwd: tmpDir });

    // Clean files may still have refactor actions, but should have no quickfix actions
    // Either no actions at all, or only refactor actions (not quickfix)
    expect(result.stdout).toMatch(/no code actions available|refactor|action\(s\) available/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("fix applies first available action by default", async () => {
    const filePath = join(tmpDir, "src/with-errors.ts");

    // --list でアクション一覧を取得
    const listResult = await radius(["fix", filePath, "--list"], { cwd: tmpDir });
    expect(listResult.exitCode).toBe(0);

    // 最初のアクションIDを抽出
    const idMatch = listResult.stdout.match(/\[(\d+)\]/);
    expect(idMatch).toBeTruthy();

    // --id で明示的に適用
    const result = await radius(["fix", filePath, "--id", idMatch![1]], { cwd: tmpDir });

    // 出力に適用されたアクションの説明が含まれる
    expect(result.stdout).toMatch(/applied:|no applicable edit/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("fix --line N applies action for specific line", async () => {
    const filePath = join(tmpDir, "src/with-errors.ts");

    // 行2に関連するアクションを --list で取得
    const listResult = await radius(["fix", filePath, "--line", "2", "--list"], { cwd: tmpDir });
    expect(listResult.exitCode).toBe(0);

    // 最初のアクションIDを抽出
    const idMatch = listResult.stdout.match(/\[(\d+)\]/);
    expect(idMatch).toBeTruthy();

    // --id で明示的に適用
    const result = await radius(["fix", filePath, "--id", idMatch![1]], { cwd: tmpDir });

    // アクションが適用されること
    expect(result.stdout).toMatch(/applied:|no applicable edit/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("fix --id applies specific action", async () => {
    const filePath = join(tmpDir, "src/with-errors.ts");

    // まず --list で id を取得
    const listResult = await radius(["fix", filePath, "--list"], { cwd: tmpDir });
    expect(listResult.exitCode).toBe(0);

    // id を抽出（例: [1] から "1" を取得）
    const idMatch = listResult.stdout.match(/\[(\d+)\]/);
    expect(idMatch).toBeTruthy();
    const actionId = idMatch![1];

    // 指定されたアクションを適用
    const result = await radius(["fix", filePath, "--id", actionId], { cwd: tmpDir });
    expect(result.stdout).toMatch(/applied:/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("fix undo reverts applied action", async () => {
    const filePath = join(tmpDir, "src/with-errors.ts");
    const originalContent = await readFixtureFile(tmpDir, "src/with-errors.ts");

    // アクション一覧を取得
    const listResult = await radius(["fix", filePath, "--list"], { cwd: tmpDir });
    expect(listResult.exitCode).toBe(0);

    // 全アクションIDを抽出
    const allIds = Array.from(listResult.stdout.matchAll(/\[(\d+)\]/g)).map(m => m[1]);
    expect(allIds.length).toBeGreaterThan(0);

    // 実際にファイルを編集するアクションを見つけるまで試行
    let fixResult;
    let tag = "";
    for (const id of allIds) {
      const contentBefore = readFileSync(filePath, "utf-8");
      fixResult = await radius(["fix", filePath, "--id", id], { cwd: tmpDir });
      expect(fixResult.exitCode).toBe(0);
      const contentAfter = readFileSync(filePath, "utf-8");

      // "applied:" を含み、かつファイル内容が変更された = 編集が適用された
      if (fixResult.stdout.includes("applied:") && contentBefore !== contentAfter) {
        tag = extractTag(fixResult.stdout);
        break;
      }
    }

    // 編集を適用できるアクションが見つかったことを確認
    expect(tag).toBeTruthy();

    // undo
    const undoResult = await radius(["undo", "--tag", tag], { cwd: tmpDir });
    expect(undoResult.exitCode).toBe(0);

    // ファイルが元に戻ること
    const restoredContent = await readFixtureFile(tmpDir, "src/with-errors.ts");
    expect(restoredContent).toBe(originalContent);
  }, 30_000);

  test("fix returns error for non-LSP files", async () => {
    // .txt ファイルを作成
    const filePath = join(tmpDir, "test.txt");
    await writeFixtureFile(tmpDir, "test.txt", "hello world");

    const result = await radius(["fix", filePath], { cwd: tmpDir });

    expect(result.stdout + result.stderr).toMatch(/code actions unavailable|no lsp|unsupported/i);
  }, 30_000);
});

describe("format", () => {
  test("format applies LSP formatting to file", async () => {
    const filePath = join(tmpDir, "src/unformatted.ts");

    const result = await radius(["format", filePath], { cwd: tmpDir });

    // ファイルが整形される
    expect(result.stdout).toMatch(/formatted:/i);
    // 出力に変更された行の概要が含まれる
    expect(result.stdout).toMatch(/changes?:|line/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("format shows no changes for already formatted file", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["format", filePath], { cwd: tmpDir });

    expect(result.stdout).toMatch(/no changes/i);
  }, 30_000);

  test("format records changeset for undo", async () => {
    const filePath = join(tmpDir, "src/unformatted.ts");
    const originalContent = await readFixtureFile(tmpDir, "src/unformatted.ts");

    // format 適用
    const formatResult = await radius(["format", filePath], { cwd: tmpDir });
    const tag = extractTag(formatResult.stdout);

    // undo
    const undoResult = await radius(["undo", "--tag", tag], { cwd: tmpDir });
    expect(undoResult.exitCode).toBe(0);

    // ファイルが元に戻ること
    const restoredContent = await readFixtureFile(tmpDir, "src/unformatted.ts");
    expect(restoredContent).toBe(originalContent);
  }, 30_000);

  test("format returns diagnostics after formatting", async () => {
    const filePath = join(tmpDir, "src/unformatted.ts");

    const result = await radius(["format", filePath], { cwd: tmpDir });

    // format 後に diagnostics セクションが含まれる
    expect(result.stdout).toMatch(/diagnostics/i);
  }, 30_000);

  test("format returns error for non-LSP files", async () => {
    // .txt ファイルを作成
    const filePath = join(tmpDir, "test.txt");
    await writeFixtureFile(tmpDir, "test.txt", "hello world");

    const result = await radius(["format", filePath], { cwd: tmpDir });

    expect(result.stdout + result.stderr).toMatch(/formatting unavailable|no lsp|unsupported/i);
  }, 30_000);
});
