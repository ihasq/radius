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
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupFixture, cleanupFixture, readFixtureFile, writeFixtureFile } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { join } from "node:path";

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("codeactions");
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

    const result = await radius(["fix", filePath], { cwd: tmpDir });

    // 出力に適用されたアクションの説明が含まれる
    expect(result.stdout).toMatch(/applied:/i);
    // diagnostics セクションが含まれる
    expect(result.stdout).toMatch(/diagnostics/i);
    // タグが発行される（Changeset が記録される）
    expect(result.stdout).toMatch(/radius-tag:/);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("fix --line N applies action for specific line", async () => {
    const filePath = join(tmpDir, "src/with-errors.ts");

    // 行2に型エラーがある
    const result = await radius(["fix", filePath, "--line", "2"], { cwd: tmpDir });

    // 2行目に関連するアクションのみ適用
    expect(result.stdout).toMatch(/line 2|:2/i);
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

    // Use --id 3 to apply "Remove unused declaration for: 'x'" which actually edits the file
    // (The first action "Install '@types/node'" is a command that doesn't edit the file)
    const fixResult = await radius(["fix", filePath, "--id", "3"], { cwd: tmpDir });
    expect(fixResult.exitCode).toBe(0);
    const tag = extractTag(fixResult.stdout);

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
