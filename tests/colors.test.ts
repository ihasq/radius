/**
 * Part E: ANSI カラー出力テスト
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius, extractTag } from "./helpers/radius";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { join } from "node:path";

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("colors");
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

describe("colors", () => {
  // ユニットテスト: colors.ts 関数の直接テスト
  describe("unit tests", () => {
    test("added() wraps with green ANSI code", () => {
      // FORCE_COLOR=1 でモジュールを動的インポート
      process.env.FORCE_COLOR = "1";
      delete process.env.NO_COLOR;

      // モジュールキャッシュをクリアして再インポート
      delete require.cache[require.resolve("../src/shared/colors")];
      const { added } = require("../src/shared/colors");

      const result = added("text");
      expect(result).toContain("\x1b[32m"); // 緑の開始コード
      expect(result).toContain("text");
      expect(result).toContain("\x1b[0m"); // リセットコード

      // クリーンアップ
      delete process.env.FORCE_COLOR;
    });

    test("removed() wraps with red ANSI code", () => {
      process.env.FORCE_COLOR = "1";
      delete process.env.NO_COLOR;

      delete require.cache[require.resolve("../src/shared/colors")];
      const { removed } = require("../src/shared/colors");

      const result = removed("text");
      expect(result).toContain("\x1b[31m"); // 赤の開始コード
      expect(result).toContain("text");

      delete process.env.FORCE_COLOR;
    });

    test("marker() wraps with yellow ANSI code", () => {
      process.env.FORCE_COLOR = "1";
      delete process.env.NO_COLOR;

      delete require.cache[require.resolve("../src/shared/colors")];
      const { marker } = require("../src/shared/colors");

      const result = marker("text");
      expect(result).toContain("\x1b[33m"); // 黄の開始コード
      expect(result).toContain("text");

      delete process.env.FORCE_COLOR;
    });

    test("filepath() wraps with cyan ANSI code", () => {
      process.env.FORCE_COLOR = "1";
      delete process.env.NO_COLOR;

      delete require.cache[require.resolve("../src/shared/colors")];
      const { filepath } = require("../src/shared/colors");

      const result = filepath("text");
      expect(result).toContain("\x1b[36m"); // シアンの開始コード
      expect(result).toContain("text");

      delete process.env.FORCE_COLOR;
    });

    test("muted() wraps with dim ANSI code", () => {
      process.env.FORCE_COLOR = "1";
      delete process.env.NO_COLOR;

      delete require.cache[require.resolve("../src/shared/colors")];
      const { muted } = require("../src/shared/colors");

      const result = muted("text");
      expect(result).toContain("\x1b[2m"); // dimの開始コード
      expect(result).toContain("text");

      delete process.env.FORCE_COLOR;
    });

    test("diagnostic error wraps with red", () => {
      process.env.FORCE_COLOR = "1";
      delete process.env.NO_COLOR;

      delete require.cache[require.resolve("../src/shared/colors")];
      const { diagnostic } = require("../src/shared/colors");

      const result = diagnostic("text", "error");
      expect(result).toContain("\x1b[31m"); // 赤
      expect(result).toContain("text");

      delete process.env.FORCE_COLOR;
    });

    test("diagnostic warning wraps with yellow", () => {
      process.env.FORCE_COLOR = "1";
      delete process.env.NO_COLOR;

      delete require.cache[require.resolve("../src/shared/colors")];
      const { diagnostic } = require("../src/shared/colors");

      const result = diagnostic("text", "warning");
      expect(result).toContain("\x1b[33m"); // 黄
      expect(result).toContain("text");

      delete process.env.FORCE_COLOR;
    });

    test("warning() wraps with yellow ANSI code", () => {
      process.env.FORCE_COLOR = "1";
      delete process.env.NO_COLOR;

      delete require.cache[require.resolve("../src/shared/colors")];
      const { warning } = require("../src/shared/colors");

      const result = warning("text");
      expect(result).toContain("\x1b[33m"); // 黄の開始コード
      expect(result).toContain("text");

      delete process.env.FORCE_COLOR;
    });
  });

  // 統合テスト: CLI側の出力（タグ、warnings）のANSIコード検証
  describe("integration tests", () => {
    test("tag output contains ANSI codes when FORCE_COLOR=1", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const result = await radius(
        [
          "str-replace",
          filePath,
          "--old",
          'const userName: string = "default_user"',
          "--new",
          'const displayName: string = "default_user"',
        ],
        { cwd: tmpDir, env: { FORCE_COLOR: "1" } }
      );

      expect(result.exitCode).toBe(0);
      // タグ出力部分（CLI側で muted() を使用）にANSIコードが含まれる
      expect(result.stdout).toContain("\x1b[");
      expect(result.stdout).toContain("\x1b[2m"); // dim (muted)
      expect(result.stdout).toContain("radius-tag:");

      await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
    });

    test("tag output has no ANSI codes when NO_COLOR=1", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const result = await radius(
        [
          "str-replace",
          filePath,
          "--old",
          'const userName: string = "default_user"',
          "--new",
          'const displayName: string = "default_user"',
        ],
        { cwd: tmpDir, env: { NO_COLOR: "1" } }
      );

      expect(result.exitCode).toBe(0);
      // NO_COLOR=1 の場合はANSIコードが含まれない
      expect(result.stdout).not.toContain("\x1b[");
      expect(result.stdout).toContain("radius-tag:");

      await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
    });

    test("warning output contains ANSI codes when FORCE_COLOR=1", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      // 不明なタグを使用してwarningを発生させる（シンプルなテスト）
      const result = await radius(
        ["view", filePath, "--tag", "xxxx-INVALID0"],
        { cwd: tmpDir, env: { FORCE_COLOR: "1" } }
      );

      // warning出力（CLI側で warning() を使用）にANSIコードが含まれる
      expect(result.stdout).toContain("\x1b[");
      expect(result.stdout).toContain("\x1b[33m"); // yellow (warning)
      expect(result.stdout).toMatch(/warning.*unknown tag/i);
    });

    test("warning output has no ANSI codes when NO_COLOR=1", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      // 不明なタグを使用してwarningを発生させる
      const result = await radius(
        ["view", filePath, "--tag", "xxxx-INVALID0"],
        { cwd: tmpDir, env: { NO_COLOR: "1" } }
      );

      // warning は出力されるが、ANSIコードは含まれない
      expect(result.stdout).toMatch(/warning.*unknown tag/i);
      expect(result.stdout).not.toContain("\x1b[");
    });
  });
});
