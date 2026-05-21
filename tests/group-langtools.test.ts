import { stopAllLsp } from "./helpers/daemon";
/**
 * Phase 19: Language Configuration / Snippets / Semantic Tokens / Tasks テスト
 *
 * CLI構文:
 *   radius comment <file> --line <N> [--uncomment] [--tag T]
 *   radius comment <file> --range <start>:<end> [--uncomment] [--tag T]
 *   radius snippet <file> --name <snippet-name> --line <N> [--tag T]
 *   radius snippet --list [--language <lang>]
 *   radius tokens <file> [--range <start>:<end>]
 *   radius task run <name> [--tag T]
 *   radius task list
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius, extractTag } from "./helpers/radius";
import { setupFixture, cleanupFixture, readFixtureFile, writeFixtureFile } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { join } from "node:path";
import { rmSync } from "node:fs";

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("langtools");
});

afterAll(async () => {
    await stopAllLsp();
  cleanupTestRadiusHome();
});

beforeEach(async () => {
  tmpDir = await setupFixture("ts-project");
});

afterEach(async () => {
  await cleanupFixture(tmpDir);
});

describe("comment", () => {
  test("comment toggles line comment", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["comment", filePath, "--line", "3"], { cwd: tmpDir });

    // 3行目がコメントアウトされる
    expect(result.stdout).toMatch(/commented|\/\//i);
    expect(result.exitCode).toBe(0);

    // ファイル内容を確認
    const content = await readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toMatch(/\/\/.*userName/);
  }, 30_000);

  test("comment --range toggles block comment", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["comment", filePath, "--range", "5:7"], { cwd: tmpDir });

    // 5〜7行がコメントアウト
    expect(result.stdout).toMatch(/commented|lines?/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("comment --uncomment removes comment", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // まずコメントアウト
    const commentResult = await radius(["comment", filePath, "--line", "3"], { cwd: tmpDir });
    const tag = extractTag(commentResult.stdout);

    // コメント解除
    const uncommentResult = await radius(["comment", filePath, "--line", "3", "--uncomment", "--tag", tag], {
      cwd: tmpDir,
    });

    expect(uncommentResult.stdout).toMatch(/uncomment|removed/i);

    // ファイル内容を確認（コメントが除去されている）
    const content = await readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toMatch(/^export const userName/m);
  }, 30_000);

  test("comment uses correct comment syntax per language", async () => {
    // TypeScript → //
    const tsPath = join(tmpDir, "src/main.ts");
    const tsResult = await radius(["comment", tsPath, "--line", "3"], { cwd: tmpDir });
    expect(tsResult.exitCode).toBe(0);

    const tsContent = await readFixtureFile(tmpDir, "src/main.ts");
    expect(tsContent).toMatch(/\/\//);

    // CSS ファイルを作成
    await writeFixtureFile(tmpDir, "style.css", "body {\n  margin: 0;\n}\n");
    const cssPath = join(tmpDir, "style.css");
    const cssResult = await radius(["comment", cssPath, "--line", "2"], { cwd: tmpDir });

    if (cssResult.exitCode === 0) {
      const cssContent = await readFixtureFile(tmpDir, "style.css");
      // CSS は /* */ を使用
      expect(cssContent).toMatch(/\/\*|\*\//);
    }
  }, 30_000);

  test("comment records changeset for undo", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const originalContent = await readFixtureFile(tmpDir, "src/main.ts");

    // comment 適用
    const commentResult = await radius(["comment", filePath, "--line", "3"], { cwd: tmpDir });
    const tag = extractTag(commentResult.stdout);

    // undo
    const undoResult = await radius(["undo", "--tag", tag], { cwd: tmpDir });
    expect(undoResult.exitCode).toBe(0);

    // ファイルが元に戻ること
    const restoredContent = await readFixtureFile(tmpDir, "src/main.ts");
    expect(restoredContent).toBe(originalContent);
  }, 30_000);
});

describe("snippet", () => {
  test("snippet --list shows available snippets", async () => {
    const result = await radius(["snippet", "--list", "--language", "typescript"], { cwd: tmpDir });

    // 出力にスニペット名と説明が含まれる
    expect(result.stdout).toMatch(/snippet/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("snippet inserts snippet at line", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // for-loop スニペットを挿入（スニペット名は実装依存）
    const result = await radius(["snippet", filePath, "--name", "for", "--line", "5"], { cwd: tmpDir });

    // 5行目にスニペットが挿入
    if (result.exitCode === 0) {
      expect(result.stdout).toMatch(/inserted|snippet/i);
      const content = await readFixtureFile(tmpDir, "src/main.ts");
      expect(content).toMatch(/for/i);
    } else {
      // スニペットが見つからない場合のエラー
      expect(result.stdout + result.stderr).toMatch(/snippet not found|unavailable/i);
    }
  }, 30_000);

  test("snippet records changeset for undo", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const originalContent = await readFixtureFile(tmpDir, "src/main.ts");

    // snippet 適用
    const snippetResult = await radius(["snippet", filePath, "--name", "for", "--line", "5"], { cwd: tmpDir });

    // コマンドが成功すること（未実装時はここでFAILする）
    expect(snippetResult.exitCode).toBe(0);

    const tag = extractTag(snippetResult.stdout);

    // undo
    const undoResult = await radius(["undo", "--tag", tag], { cwd: tmpDir });
    expect(undoResult.exitCode).toBe(0);

    // ファイルが元に戻ること
    const restoredContent = await readFixtureFile(tmpDir, "src/main.ts");
    expect(restoredContent).toBe(originalContent);
  }, 30_000);

  test("snippet returns error for unknown snippet name", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["snippet", filePath, "--name", "nonexistent-snippet-xyz", "--line", "5"], {
      cwd: tmpDir,
    });

    expect(result.stdout + result.stderr).toMatch(/snippet not found|snippet.*unknown|not available/i);
  }, 30_000);
});

describe("tokens", () => {
  test("tokens returns semantic tokens for file", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["tokens", filePath], { cwd: tmpDir });

    // 出力に各トークンの種類と位置
    expect(result.stdout).toMatch(/tokens/i);
    expect(result.stdout).toMatch(/variable|function|class|type|keyword/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("tokens --range returns tokens for line range", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["tokens", filePath, "--range", "5:10"], { cwd: tmpDir });

    // 指定範囲のトークンのみ
    expect(result.stdout).toMatch(/tokens|line/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("tokens returns error for non-LSP files", async () => {
    // .txt ファイルを作成
    const filePath = join(tmpDir, "test.txt");
    await writeFixtureFile(tmpDir, "test.txt", "hello world");

    const result = await radius(["tokens", filePath], { cwd: tmpDir });

    expect(result.stdout + result.stderr).toMatch(/semantic tokens unavailable|no lsp|unsupported/i);
  }, 30_000);
});

describe("task", () => {
  test("task list shows available tasks", async () => {
    const result = await radius(["task", "list"], { cwd: tmpDir });

    // .vscode/tasks.json から定義されたタスク一覧
    expect(result.stdout).toMatch(/tasks/i);
    expect(result.stdout).toMatch(/build|test/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("task run executes named task", async () => {
    const result = await radius(["task", "run", "build"], { cwd: tmpDir });

    // タスクのコマンドが実行
    // tasks.json で "echo build-ok" を定義しているので
    expect(result.stdout).toMatch(/build-ok|executed|completed/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("task run returns error for unknown task", async () => {
    const result = await radius(["task", "run", "nonexistent-task"], { cwd: tmpDir });

    expect(result.stdout + result.stderr).toMatch(/task not found|task.*unknown|not defined/i);
  }, 30_000);

  test("task list returns empty when no tasks.json", async () => {
    // .vscode/tasks.json を削除
    rmSync(join(tmpDir, ".vscode"), { recursive: true, force: true });

    const result = await radius(["task", "list"], { cwd: tmpDir });

    expect(result.stdout).toMatch(/no tasks defined|no tasks\.json|empty/i);
  }, 30_000);
});
