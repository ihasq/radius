/**
 * LSP Client Lifecycle Test
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius } from "./helpers/radius";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
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
  await startDaemon();
});

afterAll(async () => {
  await stopDaemon();
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
  });

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
  });

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
    ]);

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
    ]);

    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toContain("diagnostics:");
    // エラーが解消されている
    expect(r2.stdout).not.toMatch(/error\[/);

    await radius(["undo"], { cwd: tmpDir });
    await radius(["undo"], { cwd: tmpDir });
  });

  test("consecutive modify-var maintains LSP consistency", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // A→B
    await radius([
      "modify-var",
      filePath,
      "--from",
      "userName",
      "--to",
      "userNameB",
    ]);

    // B の read-var
    const r1 = await radius([
      "read-var",
      filePath,
      "--var",
      "userNameB",
    ]);

    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toContain("engine: lsp");
    expect(r1.stdout).toContain("userNameB");

    // B→C
    await radius([
      "modify-var",
      filePath,
      "--from",
      "userNameB",
      "--to",
      "userNameC",
    ]);

    // C の read-var
    const r2 = await radius([
      "read-var",
      filePath,
      "--var",
      "userNameC",
    ]);

    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toContain("engine: lsp");
    expect(r2.stdout).toContain("userNameC");

    // クリーンアップ
    await radius(["undo"], { cwd: tmpDir });
    await radius(["undo"], { cwd: tmpDir });
  });

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
    await Bun.sleep(1000);

    // typescript-language-serverプロセスが残っていないことを確認
    const lspRunning = isProcessRunning("typescript-language-server");
    expect(lspRunning).toBe(false);

    // デーモンを再起動（afterAllで停止する）
    await startDaemon();
  });
});

describe.skipIf(TSL_AVAILABLE)("LSP not available", () => {
  test("test suite skipped - typescript-language-server not found", () => {
    console.warn("LSP lifecycle tests skipped: typescript-language-server not found");
    expect(true).toBe(true);
  });
});
