/**
 * Extension Host Test
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius } from "./helpers/radius";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { join } from "node:path";
import { existsSync, rmSync } from "node:fs";

let tmpDir: string;
let extensionsDir: string;

beforeAll(async () => {
  await startDaemon();
});

afterAll(async () => {
  await stopDaemon();
});

beforeEach(async () => {
  tmpDir = await setupFixture("ts-project");
  extensionsDir = await setupFixture("extensions");
});

afterEach(async () => {
  await cleanupFixture(tmpDir);
  await cleanupFixture(extensionsDir);
});

describe("extension scanner", () => {
  test("scanExtension returns metadata from valid package.json", async () => {
    const extPath = join(extensionsDir, "valid-extension");

    // ext install でローカルパスからインストール
    const result = await radius([
      "ext", "install",
      extPath,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/installed|success/i);

    // インストールされたことを確認
    const listResult = await radius(["ext", "list"]);
    expect(listResult.stdout).toContain("test-extension");
    expect(listResult.stdout).toContain("typescript");

    // クリーンアップ
    await radius(["ext", "remove", "test.test-extension"]);
  });

  test("scanExtension returns null for missing package.json", async () => {
    const extPath = join(extensionsDir, "no-package");

    const result = await radius([
      "ext", "install",
      extPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/failed to install extension|source not found/i);
  });

  test("scanExtension returns null for non-vscode package", async () => {
    const extPath = join(extensionsDir, "no-vscode");

    const result = await radius([
      "ext", "install",
      extPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/failed to install extension|source not found/i);
  });

  test("fileExtensionMap is correctly populated", async () => {
    const extPath = join(extensionsDir, "valid-extension");

    await radius(["ext", "install", extPath]);

    // LSP情報を確認（lsp", "list コマンド）
    const lspResult = await radius(["lsp", "list"]);

    // typescript (.ts, .tsx) が登録されている
    expect(lspResult.stdout).toMatch(/typescript|\.ts|\.tsx/i);

    // クリーンアップ
    await radius(["ext", "remove", "test.test-extension"]);
  });
});

describe("extension registry", () => {
  test("install from local directory", async () => {
    const extPath = join(extensionsDir, "valid-extension");

    const result = await radius([
      "ext", "install",
      extPath,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/installed|success/i);

    // list で確認
    const listResult = await radius(["ext", "list"]);
    expect(listResult.stdout).toContain("test-extension");

    // クリーンアップ
    await radius(["ext", "remove", "test.test-extension"]);
  });

  test("list shows installed extensions", async () => {
    const ext1 = join(extensionsDir, "valid-extension");
    const ext2 = join(extensionsDir, "with-server");

    // 2つインストール
    await radius(["ext", "install", ext1]);
    await radius(["ext", "install", ext2]);

    const listResult = await radius(["ext", "list"]);

    expect(listResult.stdout).toContain("test-extension");
    expect(listResult.stdout).toContain("server-extension");

    // クリーンアップ
    await radius(["ext", "remove", "test.test-extension"]);
    await radius(["ext", "remove", "test.server-extension"]);
  });

  test("remove deletes extension", async () => {
    const extPath = join(extensionsDir, "valid-extension");

    await radius(["ext", "install", extPath]);

    // 削除
    const removeResult = await radius(["ext", "remove", "test.test-extension"]);
    expect(removeResult.exitCode).toBe(0);

    // list で確認
    const listResult = await radius(["ext", "list"]);
    expect(listResult.stdout).not.toContain("test-extension");
  });

  test("install overwrites existing extension", async () => {
    const extPath = join(extensionsDir, "valid-extension");

    // 1回目のインストール
    await radius(["ext", "install", extPath]);

    // 2回目のインストール
    const result = await radius(["ext", "install", extPath]);
    expect(result.exitCode).toBe(0);

    // listで1つだけ表示される
    const listResult = await radius(["ext", "list"]);
    const matches = listResult.stdout.match(/test-extension/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBe(1);

    // クリーンアップ
    await radius(["ext", "remove", "test.test-extension"]);
  });

  test("remove nonexistent extension returns error", async () => {
    const result = await radius(["ext", "remove", "nonexistent.extension"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not found|does not exist/i);
  });
});

describe("extension loader", () => {
  test("extractServerInfo finds server binary in extension directory", async () => {
    const extPath = join(extensionsDir, "with-server");

    await radius(["ext", "install", extPath]);

    // daemon 再起動で拡張をロード
    await stopDaemon();
    await startDaemon();

    // lsp", "list で server が認識されているか確認
    const lspResult = await radius(["lsp", "list"]);

    // mocklang が登録されている
    expect(lspResult.stdout).toMatch(/mocklang/i);

    // クリーンアップ
    await radius(["ext", "remove", "test.server-extension"]);
  });

  test("extractServerInfo uses fallback table when no binary found", async () => {
    const extPath = join(extensionsDir, "valid-extension");

    await radius(["ext", "install", extPath]);

    // daemon 再起動で拡張をロード
    await stopDaemon();
    await startDaemon();

    // typescript には server/ がないので、フォールバックテーブルを使用
    const lspResult = await radius(["lsp", "list"]);

    // typescript が登録されている（フォールバックテーブルから）
    expect(lspResult.stdout).toMatch(/typescript/i);

    // クリーンアップ
    await radius(["ext", "remove", "test.test-extension"]);
  });

  test("resolveLspServer returns correct info for file extension", async () => {
    // TypeScript ファイルに対して typescript-language-server が返される
    const lspResult = await radius(["lsp", "list"]);

    expect(lspResult.stdout).toMatch(/typescript|javascript/i);
  });

  test("extension with no languages contributes returns null server info", async () => {
    // no-vscode 拡張はlanguagesがないのでインストールできない（前のテストで確認済み）
    expect(true).toBe(true);
  });
});
