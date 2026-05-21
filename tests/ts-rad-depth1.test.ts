/**
 * ts-rad depth-1 テスト
 * depth-1 は `ts.createSourceFile()` のみ使用。node_modules を走査しない。
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { radius } from "./helpers/radius";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { getTsserverCount, measureTime, getDaemonRssMb } from "./helpers/resource-monitor";
import { setupHeavyFixture } from "./helpers/fixture-heavy";
import { join } from "node:path";
import { writeFileSync, mkdirSync, existsSync, unlinkSync, rmdirSync } from "node:fs";

let tmpDir: string;
let heavyTmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("ts-rad-depth1");
  tmpDir = await setupFixture("ts-project");
  heavyTmpDir = await setupHeavyFixture();
});

afterAll(async () => {
  await cleanupFixture(tmpDir);
  if (existsSync(heavyTmpDir)) {
    await cleanupFixture(heavyTmpDir);
  }
  cleanupTestRadiusHome();
});

describe("ts-rad depth-1: syntax only", () => {

  describe("outline", () => {

    test("outline returns symbols from AST", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const result = await radius(["outline", filePath], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("function");
      expect(result.stdout).toContain("greet");
      expect(result.stdout).toContain("userName");
    }, 30_000);

    test("outline detects exported symbols", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const result = await radius(["outline", filePath], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // export されたシンボルが検出されること
      expect(result.stdout).toContain("greet");
    }, 30_000);

    test("outline detects nested symbols", async () => {
      // テスト用のクラスファイルを作成
      const classFile = join(tmpDir, "src/test-class.ts");
      const classContent = `export class TestClass {
  method1() { return 1; }
  method2() { return 2; }
}`;
      writeFileSync(classFile, classContent);

      const result = await radius(["outline", classFile], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("class TestClass");
      // ネストしたメソッドが検出されること
      expect(result.stdout).toMatch(/method1|method2/);
    }, 30_000);

    test("outline works without tsconfig.json", async () => {
      // tsconfig.json が存在しないディレクトリで .ts ファイルを作成
      const noConfigDir = join(tmpDir, "no-config");
      if (!existsSync(noConfigDir)) mkdirSync(noConfigDir);
      const tsFile = join(noConfigDir, "standalone.ts");
      writeFileSync(tsFile, "export function test() { return 42; }");

      const result = await radius(["outline", tsFile], { cwd: noConfigDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("function test");
    }, 30_000);

    test("outline works without node_modules", async () => {
      // node_modules が存在しない状態で outline を実行
      const noModulesDir = join(tmpDir, "no-modules");
      if (!existsSync(noModulesDir)) mkdirSync(noModulesDir);
      const tsFile = join(noModulesDir, "test.ts");
      writeFileSync(tsFile, "export const x = 1;");

      const result = await radius(["outline", tsFile], { cwd: noModulesDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("x");
    }, 30_000);

  });

  describe("format", () => {

    test("format reformats file without tsserver", async () => {
      const testFile = join(tmpDir, "src/unformatted.ts");
      const unformatted = "export function test( ){return 1;}";
      writeFileSync(testFile, unformatted);

      const result = await radius(["format", testFile], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);

      // tsserver プロセスが起動していないこと
      const tsserverCount = getTsserverCount();
      expect(tsserverCount).toBe(0);
    }, 30_000);

  });

  describe("comment", () => {

    test("comment toggles line comment without tsserver", async () => {
      const testFile = join(tmpDir, "src/comment-test.ts");
      writeFileSync(testFile, "export const x = 1;\nexport const y = 2;");

      const result = await radius(["comment", testFile, "--line", "1"], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);

      // tsserver プロセスが 0 件であること
      const tsserverCount = getTsserverCount();
      expect(tsserverCount).toBe(0);
    }, 30_000);

  });

  describe("resource constraints", () => {

    test("depth-1 reads only target file", async () => {
      const filePath = join(heavyTmpDir, "src/main.ts");

      const elapsed = await measureTime(async () => {
        await radius(["outline", filePath], { cwd: heavyTmpDir });
      });

      // 実行時間が 1 秒未満であること（node_modules 走査なし）
      expect(elapsed).toBeLessThan(1000);
    }, 10_000);

    test("depth-1 memory usage under 50MB", async () => {
      const filePath = join(tmpDir, "src/main.ts");

      const rssBefore = getDaemonRssMb();
      await radius(["outline", filePath], { cwd: tmpDir });
      const rssAfter = getDaemonRssMb();

      const increase = rssAfter - rssBefore;
      // 増分が 50MB 未満であること
      expect(increase).toBeLessThan(50);
    }, 30_000);

    test("depth-1 does not resolve imports", async () => {
      const filePath = join(tmpDir, "src/deep-import.ts");

      const result = await radius(["outline", filePath], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // readFileSync のシンボルは表示されないこと（import先の走査なし）
      expect(result.stdout).not.toContain("readFileSync");
      // readConfig は表示されること（ファイル内のシンボル）
      expect(result.stdout).toContain("readConfig");
    }, 30_000);

  });

});
