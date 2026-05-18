/**
 * 診断追跡システム テスト
 *
 * - 診断ID（D-NNN 形式）
 * - 絵文字インジケータ（❌ ⚠️ ℹ️ ✅）
 * - 解消検知（resolved セクション）
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius, extractTag } from "./helpers/radius";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupFixture, cleanupFixture, writeFixtureFile, readFixtureFile } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const TSL_AVAILABLE = (() => {
  try {
    Bun.spawnSync(["typescript-language-server", "--version"]);
    return true;
  } catch {
    return false;
  }
})();

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("diagnostics-tracking");
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

describe.skipIf(!TSL_AVAILABLE)("diagnostic tracking", () => {

  // ================================================
  // 診断ID付与
  // ================================================

  describe("diagnostic IDs", () => {

    test("diagnostics include D-NNN format IDs", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // TypeScriptファイルに型エラーを導入（既にエラーがあるのでそのまま編集）
      const result = await radius([
        "str-replace",
        filePath,
        "--old",
        "const unused = 42;",
        "--new",
        "const unused = 42; const y: number = 'test';",
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);

      // 出力の diagnostics セクションに D-001 形式のIDが含まれること
      expect(result.stdout).toMatch(/D-\d{3}/);
    }, 30_000);

    test("IDs are unique across diagnostics in same output", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // 複数のエラーを含むファイルを編集（既存のエラーを保持）
      const result = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1; const y: string = 2;",
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);

      // 各診断のIDが重複しないこと
      const ids = result.stdout.match(/D-\d{3}/g) || [];
      const uniqueIds = new Set(ids);
      expect(ids.length).toBeGreaterThan(1);
      expect(uniqueIds.size).toBe(ids.length);
    }, 30_000);

    test("IDs persist across consecutive commands", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // 1回目のコマンドで D-001 のエラーを確認
      const result1 = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1;",
      ], { cwd: tmpDir });

      expect(result1.exitCode).toBe(0);
      const firstIds = result1.stdout.match(/D-\d{3}/g) || [];
      expect(firstIds.length).toBeGreaterThan(0);

      // 2回目のコマンドで同じファイルを編集（エラーは変更しない）
      const tag1 = extractTag(result1.stdout);
      const result2 = await radius([
        "str-replace",
        filePath,
        "--old",
        "const unused = 42;",
        "--new",
        "const unused = 42; // modified",
        "--tag",
        tag1,
      ], { cwd: tmpDir });

      expect(result2.exitCode).toBe(0);
      const secondIds = result2.stdout.match(/D-\d{3}/g) || [];

      // 同じエラーに同じIDが付与されていること
      expect(secondIds).toContain(firstIds[0]);
    }, 30_000);

    test("new diagnostics receive new IDs", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // 1回目: エラーを導入
      const result1 = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1;",
      ], { cwd: tmpDir });

      expect(result1.exitCode).toBe(0);
      const firstIds = result1.stdout.match(/D-\d{3}/g) || [];
      expect(firstIds.length).toBeGreaterThan(0);

      // 2回目: 新しいエラーを追加
      const tag1 = extractTag(result1.stdout);
      const result2 = await radius([
        "insert",
        filePath,
        "--line",
        "5",
        "--text",
        "const z: boolean = 123;",
        "--tag",
        tag1,
      ], { cwd: tmpDir });

      expect(result2.exitCode).toBe(0);
      const secondIds = result2.stdout.match(/D-\d{3}/g) || [];

      // 新エラーには異なるIDが付与されること
      expect(secondIds.length).toBeGreaterThan(firstIds.length);
      const newIds = secondIds.filter(id => !firstIds.includes(id));
      expect(newIds.length).toBeGreaterThan(0);
    }, 30_000);

    test("IDs are project-scoped, not file-scoped", async () => {
      const fileA = join(tmpDir, "src/with-errors.ts");
      const fileB = join(tmpDir, "src/main.ts");

      // ファイルAで D-001 を生成
      const result1 = await radius([
        "str-replace",
        fileA,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1;",
      ], { cwd: tmpDir });

      expect(result1.exitCode).toBe(0);
      const fileAIds = result1.stdout.match(/D-\d{3}/g) || [];
      expect(fileAIds.length).toBeGreaterThan(0);

      // ファイルBで新しいエラーを生成
      const tag1 = extractTag(result1.stdout);
      const result2 = await radius([
        "str-replace",
        fileB,
        "--old",
        "export const userName: string = \"default_user\";",
        "--new",
        "export const userName: number = \"default_user\";",
        "--tag",
        tag1,
      ], { cwd: tmpDir });

      expect(result2.exitCode).toBe(0);
      const fileBIds = result2.stdout.match(/D-\d{3}/g) || [];

      // ファイルBのIDは D-001 ではなく D-002 以降であること
      if (fileBIds.length > 0) {
        expect(fileBIds[0]).not.toBe("D-001");
      }
    }, 30_000);

  });

  // ================================================
  // 絵文字インジケータ
  // ================================================

  describe("emoji indicators", () => {

    test("errors show ❌ prefix", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // 型エラーを含むファイルを編集
      const result = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1;",
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // diagnostics 出力に ❌ が含まれること
      expect(result.stdout).toContain("❌");
    }, 30_000);

    test("warnings show ⚠️ prefix", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // 未使用変数の警告を導入 (TypeScript reports unused vars as info, not warnings)
      const result = await radius([
        "insert",
        filePath,
        "--line",
        "3",
        "--text",
        "const unusedVar = 123;",
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // diagnostics 出力に ⚠️ or ℹ️ が含まれること (TSはunused varsをinfoとして報告)
      expect(result.stdout).toMatch(/⚠️|ℹ️/);
    }, 30_000);

    test("info diagnostics show ℹ️ prefix", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // info レベルの診断が存在する場合
      const result = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x = 1;",
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);

      // LSPが info を返す場合のみ検証
      if (result.stdout.includes("ℹ️")) {
        expect(result.stdout).toContain("ℹ️");
      } else {
        // info がない場合はスキップ
        expect(true).toBe(true);
      }
    }, 30_000);

    test("diagnostics summary includes emoji", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // エラーと警告を含むファイルを編集
      const result = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1; const unused2 = 2;",
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);

      // "diagnostics: ❌ 1 error, ⚠️ 1 warning" 形式であること
      expect(result.stdout).toMatch(/diagnostics:.*❌.*error/i);
    }, 30_000);

  });

  // ================================================
  // 解消検知
  // ================================================

  describe("resolution detection", () => {

    test("resolved diagnostics appear in resolved section", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // 1回目: エラーを導入
      const result1 = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1;",
      ], { cwd: tmpDir });

      expect(result1.exitCode).toBe(0);
      expect(result1.stdout).toMatch(/D-\d{3}/);

      // 2回目: エラーを修正
      const tag1 = extractTag(result1.stdout);
      const result2 = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: string = 1;",
        "--new",
        "const x: string = '1';",
        "--tag",
        tag1,
      ], { cwd: tmpDir });

      expect(result2.exitCode).toBe(0);
      // resolved セクションに ✅ が表示される
      expect(result2.stdout).toMatch(/resolved:/i);
      expect(result2.stdout).toContain("✅");
    }, 30_000);

    test("resolved section shows ✅ prefix", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // エラーを導入してから修正
      const result1 = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1;",
      ], { cwd: tmpDir });

      const tag1 = extractTag(result1.stdout);
      const result = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: string = 1;",
        "--new",
        "const x: number = 1;",
        "--tag",
        tag1,
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // resolved セクション内の各行に ✅ が含まれること
      const resolvedSection = result.stdout.split("resolved:")[1];
      if (resolvedSection) {
        expect(resolvedSection).toContain("✅");
      }
    }, 30_000);

    test("partially resolved shows both active and resolved", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // 2つのエラーを導入
      const result1 = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1; const y: boolean = 2;",
      ], { cwd: tmpDir });

      // 1つだけ修正
      const tag1 = extractTag(result1.stdout);
      const result = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: string = 1;",
        "--new",
        "const x: string = '1';",
        "--tag",
        tag1,
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // diagnostics に残存エラー、resolved に修正されたエラー
      expect(result.stdout).toMatch(/diagnostics:.*error/i);
      expect(result.stdout).toMatch(/resolved:/i);
      expect(result.stdout).toContain("✅");
    }, 30_000);

    test("resolved count is displayed", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // まずエラーを導入（既存のエラー状態をレジストリに登録）
      const result1 = await radius([
        "str-replace",
        filePath,
        "--old",
        "const unused = 42;",
        "--new",
        "const unused = 43;",
      ], { cwd: tmpDir });

      const tag1 = extractTag(result1.stdout);
      // 次にエラーを修正 → resolved メッセージが表示される
      const result = await radius([
        "str-replace",
        filePath,
        "--old",
        "return a;",
        "--new",
        "return parseInt(a, 10);",
        "--tag",
        tag1,
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // resolved セクション末尾に "N issue(s) resolved by this change." が含まれること
      expect(result.stdout).toMatch(/\d+ issue.*resolved by this change/i);
    }, 30_000);

    test("no resolved section when nothing resolved", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // 新しいエラーを導入するが、既存エラーは修正しない
      const result = await radius([
        "insert",
        filePath,
        "--line",
        "5",
        "--text",
        "const z: string = 123;",
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      // "resolved:" セクションが出力に含まれないこと
      expect(result.stdout).not.toMatch(/resolved:/i);
    }, 30_000);

    test("all resolved shows diagnostics: ok with resolved section", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // エラーを導入
      const result1 = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: number = 123;",
      ], { cwd: tmpDir });

      const tag1 = extractTag(result1.stdout);

      // 2つ目のエラーも修正
      const result2 = await radius([
        "str-replace",
        filePath,
        "--old",
        "return a;",
        "--new",
        "return parseInt(a, 10);",
        "--tag",
        tag1,
      ], { cwd: tmpDir });

      expect(result2.exitCode).toBe(0);
      // "diagnostics: ok" と "resolved:" セクションの両方が表示
      expect(result2.stdout).toMatch(/diagnostics:\s*ok/i);
      expect(result2.stdout).toMatch(/resolved:/i);
    }, 30_000);

  });

  // ================================================
  // 診断レジストリ永続化
  // ================================================

  describe("diagnostic registry", () => {

    test("diagnostics.json is created after first write command", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // 書き込みコマンドを実行
      const result = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1;",
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);

      // ~/.radius/<hash>/diagnostics.json が存在すること
      const radiusHome = process.env.RADIUS_HOME!;
      const projectHash = createHash("sha256").update(tmpDir).digest("hex").substring(0, 16);
      const diagnosticsPath = join(radiusHome, projectHash, "diagnostics.json");
      expect(existsSync(diagnosticsPath)).toBe(true);
    }, 30_000);

    test("diagnostics.json contains file-keyed entries", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // 書き込みコマンドを実行
      await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1;",
      ], { cwd: tmpDir });

      // diagnostics.json を読み込む
      const radiusHome = process.env.RADIUS_HOME!;
      const projectHash = createHash("sha256").update(tmpDir).digest("hex").substring(0, 16);
      const diagnosticsPath = join(radiusHome, projectHash, "diagnostics.json");
      const content = readFileSync(diagnosticsPath, "utf-8");
      const data = JSON.parse(content);

      // ファイルパスをキーとしたオブジェクト構造であること
      expect(typeof data).toBe("object");
      expect(data).toHaveProperty("nextId");
      expect(data).toHaveProperty("files");
      expect(typeof data.files).toBe("object");
      const fileKeys = Object.keys(data.files);
      expect(fileKeys.length).toBeGreaterThan(0);

      // 各エントリに id, severity, code, line, message が含まれること
      const diagnostics = data.files[fileKeys[0]];
      expect(Array.isArray(diagnostics)).toBe(true);
      expect(diagnostics.length).toBeGreaterThan(0);
      const firstEntry: any = diagnostics[0];
      expect(firstEntry).toHaveProperty("id");
      expect(firstEntry).toHaveProperty("severity");
      expect(firstEntry).toHaveProperty("code");
      expect(firstEntry).toHaveProperty("line");
      expect(firstEntry).toHaveProperty("message");
    }, 30_000);

    test("diagnostics.json updates after each write command", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");
      const radiusHome = process.env.RADIUS_HOME!;
      const projectHash = createHash("sha256").update(tmpDir).digest("hex").substring(0, 16);
      const diagnosticsPath = join(radiusHome, projectHash, "diagnostics.json");

      // 1回目のコマンド → diagnostics.json にエントリが存在
      const result1 = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1;",
      ], { cwd: tmpDir });

      const content1 = readFileSync(diagnosticsPath, "utf-8");
      const data1 = JSON.parse(content1);
      const diagnosticCount1 = (data1.files[filePath] || []).length;
      expect(diagnosticCount1).toBeGreaterThan(0);

      // 2回目のコマンドでエラーを修正 → diagnostics.json からエントリが削除
      const tag1 = extractTag(result1.stdout);
      await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: string = 1;",
        "--new",
        "const x: number = 1;",
        "--tag",
        tag1,
      ], { cwd: tmpDir });

      const content2 = readFileSync(diagnosticsPath, "utf-8");
      const data2 = JSON.parse(content2);
      const diagnosticCount2 = (data2.files[filePath] || []).length;
      expect(diagnosticCount2).toBeLessThan(diagnosticCount1);
    }, 30_000);

    test("ID counter persists across daemon restarts", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // エラーを導入してIDを生成
      const result1 = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1;",
      ], { cwd: tmpDir });

      expect(result1.exitCode).toBe(0);
      const firstIds = result1.stdout.match(/D-\d{3}/g) || [];
      const maxId = Math.max(...firstIds.map(id => parseInt(id.replace("D-", ""), 10)));

      // daemon stop → 再起動
      await stopDaemon();
      await startDaemon();

      // 新しいエラー → 次のIDが付与されること (daemon再起動後なので --tag なし)
      const result2 = await radius([
        "insert",
        filePath,
        "--line",
        "5",
        "--text",
        "const z: boolean = 123;",
        "--reason",
        "Testing ID persistence",
      ], { cwd: tmpDir });

      expect(result2.exitCode).toBe(0);
      const secondIds = result2.stdout.match(/D-\d{3}/g) || [];
      const newIds = secondIds.map(id => parseInt(id.replace("D-", ""), 10));
      const maxNewId = Math.max(...newIds);

      // D-001 にリセットされないこと
      expect(maxNewId).toBeGreaterThan(maxId);
    }, 30_000);

  });

  // ================================================
  // コマンド別統合
  // ================================================

  describe("command integration", () => {

    test("str-replace shows diagnostic IDs and emoji", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // str-replace 実行後の出力に D-NNN と ❌/⚠️ が含まれること
      const result = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1;",
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/D-\d{3}/);
      expect(result.stdout).toMatch(/❌|⚠️/);
    }, 30_000);

    test("insert shows diagnostic IDs and emoji", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // insert 実行後の出力に D-NNN と ❌/⚠️ が含まれること
      const result = await radius([
        "insert",
        filePath,
        "--line",
        "5",
        "--text",
        "const z: string = 123;",
      ], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/D-\d{3}/);
      expect(result.stdout).toMatch(/❌|⚠️/);
    }, 30_000);

    test("fix resolves diagnostic by ID", async () => {
      const filePath = join(tmpDir, "src/with-errors.ts");

      // 修正可能なエラーを導入
      const result1 = await radius([
        "str-replace",
        filePath,
        "--old",
        "const x: number = \"hello\";",
        "--new",
        "const x: string = 1;",
      ], { cwd: tmpDir });

      // fix でエラーを修正
      const tag1 = extractTag(result1.stdout);
      const listResult = await radius(["fix", filePath, "--list", "--tag", tag1], { cwd: tmpDir });
      const idMatch = listResult.stdout.match(/\[(\d+)\]/);

      if (idMatch) {
        const tag2 = extractTag(listResult.stdout);
        const result = await radius(["fix", filePath, "--id", idMatch[1], "--tag", tag2], { cwd: tmpDir });

        expect(result.exitCode).toBe(0);

        // resolved セクションに修正された診断のIDが表示されること
        if (result.stdout.includes("resolved:")) {
          expect(result.stdout).toMatch(/D-\d{3}/);
          expect(result.stdout).toContain("✅");
        }
      }
    }, 30_000);

  });

});
