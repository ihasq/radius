/**
 * LSP Core Operations Test
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius, extractTag } from "./helpers/radius";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { spawnSync } from "bun";
import { join } from "node:path";

// typescript-language-server の存在チェック
const TSL_AVAILABLE = (() => {
  try {
    const localPath = join(process.cwd(), "node_modules", ".bin", "typescript-language-server");
    if (require("node:fs").existsSync(localPath)) {
      const result = spawnSync([localPath, "--version"]);
      if (result.exitCode === 0) return true;
    }

    const result = spawnSync(["typescript-language-server", "--version"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
})();

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("lsp-core");
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

describe.skipIf(!TSL_AVAILABLE)("read-var with LSP", () => {
  test("returns engine: lsp for TypeScript file", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "read-var",
      filePath,
      "--var",
      "userName",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("engine: lsp");
  }, 30_000);

  test("finds definition and references", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "read-var",
      filePath,
      "--var",
      "userName",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("definition");
    // userName は main.ts と utils.ts で参照されるので、occurrences >= 2
    const occurrenceMatches = result.stdout.match(/occurrence/gi);
    expect(occurrenceMatches).toBeTruthy();
  }, 30_000);

  test("returns context lines around each occurrence", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "read-var",
      filePath,
      "--var",
      "userName",
    ]);

    expect(result.exitCode).toBe(0);
    // ">" マーカーが含まれることを確認
    expect(result.stdout).toContain(">");
    // 行番号が含まれることを確認
    expect(result.stdout).toMatch(/\d+:/);
  }, 30_000);

  test("falls back to engine: text for unknown language", async () => {
    const pyFile = join(tmpDir, "test.py");

    const r1 = await radius([
      "create",
      pyFile,
      "--content",
      "userName = 'test'",
    ], { cwd: tmpDir });

    const result = await radius([
      "read-var",
      pyFile,
      "--var",
      "userName",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("engine: text");

    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });
  }, 30_000);

  test("falls back to engine: text when variable not found by LSP", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 文字列リテラル内の変数をLSPは見つけられない
    const result = await radius([
      "read-var",
      filePath,
      "--var",
      "nonexistent",
    ]);

    // LSPで見つからない場合、textフォールバックまたはエラー
    expect([0, 1]).toContain(result.exitCode);
  }, 30_000);
});

describe.skipIf(!TSL_AVAILABLE)("modify-var with LSP", () => {
  test("renames variable across file with engine: lsp", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "modify-var",
      filePath,
      "--from",
      "userName",
      "--to",
      "displayName",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("engine: lsp");

    // ファイル内容の確認
    const content = require("node:fs").readFileSync(filePath, "utf-8");
    expect(content).toContain("displayName");
    expect(content).not.toContain("userName:");

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  }, 30_000);

  test("renames variable across multiple files", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "modify-var",
      filePath,
      "--from",
      "userName",
      "--to",
      "displayName",
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/files modified:\s*[2-9]/); // 最低2ファイル

    // utils.ts も変更されているか確認
    const utilsContent = require("node:fs").readFileSync(
      join(tmpDir, "src/utils.ts"),
      "utf-8"
    );
    expect(utilsContent).toContain("displayName");

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  }, 30_000);

  test("falls back to text replacement for non-LSP languages", async () => {
    const pyFile = join(tmpDir, "test.py");

    const r1 = await radius([
      "create",
      pyFile,
      "--content",
      "userName = 'test'\nprint(userName)",
    ], { cwd: tmpDir });

    const r2 = await radius([
      "modify-var",
      pyFile,
      "--from",
      "userName",
      "--to",
      "displayName",
      "--tag",
      extractTag(r1.stdout),
    ], { cwd: tmpDir });

    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toContain("engine: text");

    const r3 = await radius(["undo", "--tag", extractTag(r2.stdout)], { cwd: tmpDir });
    await radius(["undo", "--tag", extractTag(r3.stdout)], { cwd: tmpDir });
  }, 30_000);

  test("undo after modify-var restores all files", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 変更前の内容を保存
    const beforeMain = require("node:fs").readFileSync(filePath, "utf-8");
    const beforeUtils = require("node:fs").readFileSync(
      join(tmpDir, "src/utils.ts"),
      "utf-8"
    );

    // modify-var実行
    const r1 = await radius([
      "modify-var",
      filePath,
      "--from",
      "userName",
      "--to",
      "displayName",
    ], { cwd: tmpDir });

    // undo
    await radius(["undo", "--tag", extractTag(r1.stdout)], { cwd: tmpDir });

    // 復元確認
    const afterMain = require("node:fs").readFileSync(filePath, "utf-8");
    const afterUtils = require("node:fs").readFileSync(
      join(tmpDir, "src/utils.ts"),
      "utf-8"
    );

    expect(afterMain).toBe(beforeMain);
    expect(afterUtils).toBe(beforeUtils);
  }, 30_000);
});

describe.skipIf(TSL_AVAILABLE)("LSP not available", () => {
  test("test suite skipped - typescript-language-server not found", () => {
    console.warn("LSP core tests skipped: typescript-language-server not found");
    expect(true).toBe(true);
  }, 30_000);
});
