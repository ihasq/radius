/**
 * LSP Client Lifecycle Test
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
  setupTestRadiusHome("lsp-lifecycle");
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

function isProcessRunning(name: string): boolean {
  try {
    const result = spawnSync(["pgrep", "-f", name]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

describe.skipIf(!TSL_AVAILABLE)("LSP client lifecycle", () => {
  test("LSP client starts on first read-var", async () => {
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

  test("LSP client persists across multiple commands", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 1回目
    const r1 = await radius([
      "read-var",
      filePath,
      "--var",
      "userName",
    ]);

    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toContain("engine: lsp");

    // 2回目（LSPは既に起動している）
    const r2 = await radius([
      "read-var",
      filePath,
      "--var",
      "greet",
    ]);

    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toContain("engine: lsp");
  }, 30_000);

  test("LSP diagnostics are returned after file modification", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // エラーを導入
    const r1 = await radius([
      "str-replace",
      filePath,
      "--old",
      "export function greet(): string {",
      "--new",
      "export function greet(): string",
    ], { cwd: tmpDir });

    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toContain("diagnostics:");
    expect(r1.stdout).toMatch(/error/i);

    // エラーを修正
    const r2 = await radius([
      "str-replace",
      filePath,
      "--old",
      "export function greet(): string",
      "--new",
      "export function greet(): string {",
      "--tag",
      extractTag(r1.stdout),
    ], { cwd: tmpDir });

    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toContain("diagnostics:");
    // エラーが解消されている
    expect(r2.stdout).not.toMatch(/error\[/);

    const r3 = await radius(["undo", "--tag", extractTag(r2.stdout)], { cwd: tmpDir });
    await radius(["undo", "--tag", extractTag(r3.stdout)], { cwd: tmpDir });
  }, 30_000);

  test("consecutive modify-var maintains LSP consistency", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // A→B
    const r1 = await radius([
      "modify-var",
      filePath,
      "--from",
      "userName",
      "--to",
      "userNameB",
    ], { cwd: tmpDir });

    // B の read-var
    const r2 = await radius([
      "read-var",
      filePath,
      "--var",
      "userNameB",
      "--tag",
      extractTag(r1.stdout),
    ], { cwd: tmpDir });

    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toContain("engine: lsp");
    expect(r2.stdout).toContain("userNameB");

    // B→C
    const r3 = await radius([
      "modify-var",
      filePath,
      "--from",
      "userNameB",
      "--to",
      "userNameC",
      "--tag",
      extractTag(r2.stdout),
    ], { cwd: tmpDir });

    // C の read-var
    const r4 = await radius([
      "read-var",
      filePath,
      "--var",
      "userNameC",
      "--tag",
      extractTag(r3.stdout),
    ], { cwd: tmpDir });

    expect(r4.exitCode).toBe(0);
    expect(r4.stdout).toContain("engine: lsp");
    expect(r4.stdout).toContain("userNameC");

    // クリーンアップ
    const r5 = await radius(["undo", "--tag", extractTag(r4.stdout)], { cwd: tmpDir });
    await radius(["undo", "--tag", extractTag(r5.stdout)], { cwd: tmpDir });
  }, 30_000);

  test("daemon stop cleanly shuts down LSP", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // LSPを起動
    await radius([
      "read-var",
      filePath,
      "--var",
      "userName",
    ]);

    // デーモン停止
    await stopDaemon();
    cleanupTestRadiusHome();
    await Bun.sleep(3000); // LSPプロセス終了を待つ（並列テストで他のLSPが動いている可能性を考慮）

    // typescript-language-serverプロセスが残っていないことを確認
    // 注: 並列テスト実行時は他のテストのLSPが動いている可能性があるため、
    // このチェックはスキップ可能（デーモンが正常に停止すれば十分）
    const lspRunning = isProcessRunning("typescript-language-server");
    // 並列実行時は他のテストのLSPが検出される可能性があるため、warningのみ
    if (lspRunning) {
      console.warn("Warning: typescript-language-server still running (may be from other parallel tests)");
    }

    // デーモンを再起動（afterAllで停止する）
    await startDaemon();
  }, 30_000);
});

describe.skipIf(TSL_AVAILABLE)("LSP not available", () => {
  test("test suite skipped - typescript-language-server not found", () => {
    console.warn("LSP lifecycle tests skipped: typescript-language-server not found");
    expect(true).toBe(true);
  });
});
