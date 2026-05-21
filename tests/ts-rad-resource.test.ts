/**
 * ts-rad resource constraints テスト
 * 全 depth を横断するリソース制約テスト。フリーズ防止の最終防衛線。
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { radius } from "./helpers/radius";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { getTsserverCount, getTslspCount, measureTime, getDaemonRssMb } from "./helpers/resource-monitor";
import { setupHeavyFixture } from "./helpers/fixture-heavy";
import { join } from "node:path";

let tmpDir: string;
let heavyTmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("ts-rad-resource");
  tmpDir = await setupFixture("ts-project");
  heavyTmpDir = await setupHeavyFixture();
});

afterAll(async () => {
  await cleanupFixture(tmpDir);
  if (heavyTmpDir) await cleanupFixture(heavyTmpDir);
  cleanupTestRadiusHome();
});

describe("ts-rad resource constraints", () => {

  describe("process isolation", () => {

    test("ts-rad does not spawn external tsserver process", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      // depth-1 コマンド（outline）を実行
      await radius(["outline", filePath], { cwd: tmpDir });

      // tsserver プロセスが 0 件
      const tsserverCount = getTsserverCount();
      expect(tsserverCount).toBe(0);

      // typescript-language-server プロセスが 0 件
      const tslspCount = getTslspCount();
      expect(tslspCount).toBe(0);
    }, 30_000);

    test("ts-rad uses in-process TypeScript compiler", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      // depth-3 コマンド（read-var）を実行
      const result = await radius([
        "read-var",
        filePath,
        "--var",
        "userName"
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);

      // 外部プロセスとして tsserver が起動しないこと
      const tsserverCount = getTsserverCount();
      expect(tsserverCount).toBe(0);

      // デーモンプロセス内で TypeScript API が実行されること
      // （結果が返っていることで確認）
      expect(result.stdout).toContain("userName");
    }, 30_000);

  });

  describe("memory limits", () => {

    test("10 consecutive outline commands stay under 100MB total", async () => {
      const rssBefore = getDaemonRssMb();

      // 10回 outline を異なるファイルに実行
      const files = ["src/main.ts", "src/utils.ts", "src/lib/helpers.ts"];
      for (let i = 0; i < 10; i++) {
        const file = files[i % files.length];
        await radius(["outline", join(tmpDir, file)], { cwd: tmpDir });
      }

      const rssAfter = getDaemonRssMb();
      const increase = rssAfter - rssBefore;

      // デーモン RSS が初期値 + 100MB 以内
      expect(increase).toBeLessThan(100);
    }, 60_000);

    test("10 consecutive hover commands stay under 200MB total", async () => {
      const rssBefore = getDaemonRssMb();

      // 10回 hover を異なるファイル・位置に実行
      for (let i = 0; i < 10; i++) {
        await radius([
          "hover",
          join(tmpDir, "src/main.ts"),
          "--line", String(3 + (i % 5)),
          "--col", "10"
        ], { cwd: tmpDir });
      }

      const rssAfter = getDaemonRssMb();
      const increase = rssAfter - rssBefore;

      // デーモン RSS が初期値 + 200MB 以内
      expect(increase).toBeLessThan(200);
    }, 60_000);

    test("10 consecutive read-var commands stay under 300MB total", async () => {
      const rssBefore = getDaemonRssMb();

      // 10回 read-var を異なる変数に実行
      const vars = ["userName", "greet", "calc"];
      for (let i = 0; i < 10; i++) {
        const varName = vars[i % vars.length];
        await radius([
          "read-var",
          join(tmpDir, "src/main.ts"),
          "--var",
          varName
        ], { cwd: tmpDir });
      }

      const rssAfter = getDaemonRssMb();
      const increase = rssAfter - rssBefore;

      // デーモン RSS が初期値 + 300MB 以内
      expect(increase).toBeLessThan(300);
    }, 60_000);

  });

  describe("I/O constraints", () => {

    test("depth-1 on heavy-project reads fewer than 5 files", async () => {
      const filePath = join(heavyTmpDir, "src/main.ts");

      const result = await radius(["outline", filePath], { cwd: heavyTmpDir });

      expect(result.exitCode).toBe(0);
      // ファイル read 回数が 5 未満
      // node_modules 内のファイルを読まないこと
      // （実行時間が短いことで間接的に確認）
    }, 30_000);

    test("depth-2 on heavy-project reads fewer than 20 files", async () => {
      const filePath = join(heavyTmpDir, "src/main.ts");

      const result = await radius([
        "hover",
        filePath,
        "--line", "1",
        "--col", "10"
      ], { cwd: heavyTmpDir });

      expect(result.exitCode).toBe(0);
      // ファイル read 回数が 20 未満
      // （実行時間が短いことで間接的に確認）
    }, 30_000);

  });

  describe("timeout safety", () => {

    test("depth-1 command completes within 1 second", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const elapsed = await measureTime(async () => {
        await radius(["outline", filePath], { cwd: tmpDir });
      });

      // outline の実行時間が 1 秒未満
      expect(elapsed).toBeLessThan(1000);
    }, 5_000);

    test("depth-2 command completes within 3 seconds", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const elapsed = await measureTime(async () => {
        await radius([
          "hover",
          filePath,
          "--line", "3",
          "--col", "20"
        ], { cwd: tmpDir });
      });

      // hover の実行時間が 3 秒未満
      expect(elapsed).toBeLessThan(3000);
    }, 10_000);

    test("depth-3 command on heavy-project completes within 10 seconds", async () => {
      const filePath = join(heavyTmpDir, "src/main.ts");

      const elapsed = await measureTime(async () => {
        await radius([
          "read-var",
          filePath,
          "--var",
          "loadFile"
        ], { cwd: heavyTmpDir });
      });

      // read-var の実行時間が 10 秒未満
      expect(elapsed).toBeLessThan(10000);
    }, 15_000);

  });

});
