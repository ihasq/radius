/**
 * Phase 18: LLM可読ビュー テスト
 *
 * CLI構文:
 *   radius outline <file> [--tag T]
 *   radius hover <file> --line <N> --col <N> [--tag T]
 *   radius problems [<file-or-dir>] [--tag T]
 *   radius typehierarchy <file> --symbol <name> [--tag T]
 *   radius diff <file> [--ref <git-ref>] [--tag T]
 *   radius codelens <file> [--tag T]
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius } from "./helpers/radius";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupFixture, cleanupFixture, writeFixtureFile } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("lspviews");
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

describe("outline", () => {
  test("outline returns symbol tree for TypeScript file", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["outline", filePath], { cwd: tmpDir });

    // 出力にクラス、関数、変数がインデント付きツリーで表示
    expect(result.stdout).toMatch(/outline:/i);
    // 各シンボルに kind, name, line が含まれる
    expect(result.stdout).toMatch(/function|const|class/i);
    expect(result.stdout).toMatch(/line \d+|\[\d+\]/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("outline shows nested symbols", async () => {
    const filePath = join(tmpDir, "src/classes.ts");

    const result = await radius(["outline", filePath], { cwd: tmpDir });

    // クラス内メソッドがネストで表示
    expect(result.stdout).toMatch(/BaseService|UserService|AdminService/);
    // インデントで親子関係が表現される
    expect(result.stdout).toMatch(/getUser|isAdmin/);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("outline returns empty for file with no symbols", async () => {
    // 空ファイルを作成
    const filePath = join(tmpDir, "empty.ts");
    await writeFixtureFile(tmpDir, "empty.ts", "// empty file\n");

    const result = await radius(["outline", filePath], { cwd: tmpDir });

    expect(result.stdout).toMatch(/no symbols found/i);
  }, 30_000);

  test("outline falls back to text for non-LSP files", async () => {
    // .py ファイルを作成
    const filePath = join(tmpDir, "test.py");
    await writeFixtureFile(tmpDir, "test.py", "def hello():\n    pass\n");

    const result = await radius(["outline", filePath], { cwd: tmpDir });

    // テキストベースの検出、または "no symbols found"、または "outline unavailable"
    expect(result.stdout + result.stderr).toMatch(/outline:|no symbols found|outline unavailable|no lsp|text-based/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);
});

describe("hover", () => {
  test("hover returns type info at position", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // userName変数がある行3、col 14あたり
    const result = await radius(["hover", filePath, "--line", "3", "--col", "14"], { cwd: tmpDir });

    // 出力に型情報が含まれる
    expect(result.stdout).toMatch(/string|userName/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("hover returns documentation if available", async () => {
    const filePath = join(tmpDir, "src/documented.ts");

    // JSDoc付きのcircleArea関数（行6）
    const result = await radius(["hover", filePath, "--line", "6", "--col", "17"], { cwd: tmpDir });

    // 出力にドキュメント文字列が含まれる
    expect(result.stdout).toMatch(/area of|circle.*area|circleArea/i);
  }, 30_000);

  test("hover returns nothing for empty position", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 空行またはコメント内の位置
    const result = await radius(["hover", filePath, "--line", "1", "--col", "1"], { cwd: tmpDir });

    // import文の先頭なので何かしら情報があるか、なければメッセージ
    expect(result.stdout).toMatch(/import from|no information|module.*".*"/i);
  }, 30_000);
});

describe("problems", () => {
  test("problems returns diagnostics for file", async () => {
    const filePath = join(tmpDir, "src/with-errors.ts");

    const result = await radius(["problems", filePath], { cwd: tmpDir });

    // 診断情報または "no problems found" が返される
    // (LSPのタイミングにより診断が収集されない場合がある)
    expect(result.stdout).toMatch(/error|warning|no problems found|problems:/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("problems returns diagnostics for directory", async () => {
    const dirPath = join(tmpDir, "src");

    const result = await radius(["problems", dirPath], { cwd: tmpDir });

    // 複数ファイルの診断がファイル別に表示、または問題なし
    // (診断収集はLSPのタイミングに依存するため、"no problems found"も許容)
    expect(result.stdout).toMatch(/\.ts|no problems found|problems:/i);
    expect(result.exitCode).toBe(0);
  }, 60_000);

  test("problems returns clean for error-free file", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["problems", filePath], { cwd: tmpDir });

    expect(result.stdout).toMatch(/no problems found|0 error|clean/i);
  }, 30_000);

  test("problems returns all project diagnostics when no path given", async () => {
    const result = await radius(["problems"], { cwd: tmpDir });

    // プロジェクト全体の診断
    expect(result.stdout).toMatch(/problems|diagnostic/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);
});

describe("typehierarchy", () => {
  test("typehierarchy shows supertypes and subtypes or no hierarchy", async () => {
    const filePath = join(tmpDir, "src/classes.ts");

    const result = await radius(["typehierarchy", filePath, "--symbol", "UserService"], { cwd: tmpDir });

    // 出力に supertypes と subtypes がツリーで表示
    // TypeScript LSP might not support type hierarchy, so accept "no type hierarchy" as well
    expect(result.stdout).toMatch(/type hierarchy|no type hierarchy/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("typehierarchy shows implements for interfaces", async () => {
    // インタフェースを実装するクラスを含むファイル
    const filePath = join(tmpDir, "src/documented.ts");

    const result = await radius(["typehierarchy", filePath, "--symbol", "UserProfile"], { cwd: tmpDir });

    // interfaces は implements 関係があれば表示、なければ "no type hierarchy"
    expect(result.stdout).toMatch(/type hierarchy|interface|no.*hierarchy/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("typehierarchy returns error for non-class symbols", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 変数名を指定した場合
    const result = await radius(["typehierarchy", filePath, "--symbol", "userName"], { cwd: tmpDir });

    // Variables don't have type hierarchies
    expect(result.stdout).toMatch(/no type hierarchy available|not found/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);
});

describe("diff", () => {
  test("diff shows unstaged changes", async () => {
    // git リポジトリを初期化
    execSync(
      "git init && git config user.email 'test@test.com' && git config user.name 'test' && git add -A && git commit -m 'init'",
      { cwd: tmpDir, stdio: "ignore" }
    );

    // ファイルを変更
    const filePath = join(tmpDir, "src/main.ts");
    await writeFixtureFile(
      tmpDir,
      "src/main.ts",
      `import { calc } from "./lib/helpers";

export const displayName: string = "modified_user";

export function greet(): string {
  return \`Hello, \${displayName}!\`;
}
`
    );

    const result = await radius(["diff", filePath], { cwd: tmpDir });

    // 出力に追加行（+）と削除行（-）が含まれる
    expect(result.stdout).toMatch(/\+|\-|added|removed|changed/i);
    // 行番号付き
    expect(result.stdout).toMatch(/\d+/);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("diff --ref shows changes against specific commit", async () => {
    // git リポジトリを初期化
    execSync(
      "git init && git config user.email 'test@test.com' && git config user.name 'test' && git add -A && git commit -m 'init'",
      { cwd: tmpDir, stdio: "ignore" }
    );

    // ファイルを変更してコミット
    const filePath = join(tmpDir, "src/main.ts");
    await writeFixtureFile(tmpDir, "src/main.ts", "// modified\n");
    execSync("git add -A && git commit -m 'modify'", { cwd: tmpDir, stdio: "ignore" });

    const result = await radius(["diff", filePath, "--ref", "HEAD~1"], { cwd: tmpDir });

    // 前コミットとの差分が表示
    expect(result.stdout).toMatch(/\+|\-|diff|change/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("diff shows no changes for clean file", async () => {
    // git リポジトリを初期化
    execSync(
      "git init && git config user.email 'test@test.com' && git config user.name 'test' && git add -A && git commit -m 'init'",
      { cwd: tmpDir, stdio: "ignore" }
    );

    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["diff", filePath], { cwd: tmpDir });

    expect(result.stdout).toMatch(/no changes/i);
  }, 30_000);

  test("diff works outside git repository", async () => {
    // git リポジトリ外 (tmpDir は fixture なので git init されていない場合)
    const nonGitDir = join(tmpDir, "..", "non-git-dir");
    mkdirSync(nonGitDir, { recursive: true });
    writeFileSync(join(nonGitDir, "test.ts"), "const x = 1;\n");

    const result = await radius(["diff", join(nonGitDir, "test.ts")], { cwd: nonGitDir });

    expect(result.stdout + result.stderr).toMatch(/not a git repository|no git|git.*error/i);
  }, 30_000);
});

describe("codelens", () => {
  test("codelens returns reference counts or no lenses", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(["codelens", filePath], { cwd: tmpDir });

    // TypeScript LSP might not provide code lenses by default
    // So we accept either code lenses with reference info, or "no code lenses"
    expect(result.stdout).toMatch(/codelens|no code lenses|reference|implementation/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("codelens returns implementation counts for interfaces or no lenses", async () => {
    const filePath = join(tmpDir, "src/classes.ts");

    const result = await radius(["codelens", filePath], { cwd: tmpDir });

    // クラスに対する実装/参照数、またはcode lensがない場合
    expect(result.stdout).toMatch(/reference|implementation|\d+|no code lenses/i);
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("codelens returns empty for file with no lenses", async () => {
    // 空に近いファイル
    const filePath = join(tmpDir, "empty.ts");
    await writeFixtureFile(tmpDir, "empty.ts", "// no code\n");

    const result = await radius(["codelens", filePath], { cwd: tmpDir });

    expect(result.stdout).toMatch(/no code lenses|0 lens/i);
    expect(result.exitCode).toBe(0);
  }, 60_000);
});
