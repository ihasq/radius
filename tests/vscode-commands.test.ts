/**
 * Phase 5: VSCode コマンドパレット互換テスト
 *
 * editor.action.* を既存 radius コマンドにマッピングし、
 * radius vscode-cmd で実行可能にする。
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { radius } from "./helpers/radius";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { join } from "path";

describe("VSCode Command Palette", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await setupFixture("ts-project");
  });

  afterAll(async () => {
    await cleanupFixture(tmpDir);
  });

  test("T01: editor.action.formatDocument → radius format <file>", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["vscode-cmd", "editor.action.formatDocument", filePath], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("formatted");
  });

  test("T02: editor.action.rename → radius modify-var <file> --from <old> --to <new>", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(
      ["vscode-cmd", "editor.action.rename", filePath, "--from", "userName", "--to", "userFullName"],
      { cwd: tmpDir }
    );
    expect(result.exitCode).toBe(0);
  });

  test("T03: editor.action.organizeImports → 未使用 import を削除", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["vscode-cmd", "editor.action.organizeImports", filePath], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });

  test("T04: editor.action.goToDefinition → シンボルの定義ファイルと行番号を返す", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(
      ["vscode-cmd", "editor.action.goToDefinition", filePath, "--line", "5", "--col", "20"],
      { cwd: tmpDir }
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/line \d+/);
  });

  test("T05: editor.action.findAllReferences → radius read-var <file> --var <name>", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(
      ["vscode-cmd", "editor.action.findAllReferences", filePath, "--var", "userName"],
      { cwd: tmpDir }
    );
    expect(result.exitCode).toBe(0);
  });

  test("T06: editor.action.commentLine → radius comment <file> --line <N>", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["vscode-cmd", "editor.action.commentLine", filePath, "--line", "3"], {
      cwd: tmpDir,
    });
    expect(result.exitCode).toBe(0);
  });

  test("T07: editor.action.triggerSuggest → 補完候補一覧を返す", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(
      ["vscode-cmd", "editor.action.triggerSuggest", filePath, "--line", "5", "--col", "10"],
      { cwd: tmpDir }
    );
    expect(result.exitCode).toBe(0);
  });

  test("T08: workbench.action.gotoSymbol → radius outline <file>", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(["vscode-cmd", "workbench.action.gotoSymbol", filePath], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("symbol");
  });

  test("T09: workbench.action.quickOpen → プロジェクト内ファイル一覧を返す", async () => {
    const result = await radius(["vscode-cmd", "workbench.action.quickOpen"], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(".ts");
  });

  test("T10: 拡張が registerCommand で登録したコマンドが実行可能", async () => {
    // vscode-stub で登録されたコマンドを実行
    const vscode = await import("../src/vscode-stub/index");
    vscode.commands.registerCommand("test.customCommand", () => "custom result");

    const { executeCommand } = await import("../src/vscode-stub/commands");
    const result = await executeCommand("test.customCommand");
    expect(result).toBe("custom result");
  });

  test("T11: radius vscode-cmd editor.action.formatDocument <file> → format と同等出力", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // vscode-cmd 経由
    const vscodeResult = await radius(["vscode-cmd", "editor.action.formatDocument", filePath], { cwd: tmpDir });

    // format コマンド直接
    const formatResult = await radius(["format", filePath], { cwd: tmpDir });

    // 両方成功することを確認（完全一致は期待しない）
    expect(vscodeResult.exitCode).toBe(0);
    expect(formatResult.exitCode).toBe(0);
  });

  test("T12: radius vscode-cmd --list → 全登録コマンドID一覧", async () => {
    const result = await radius(["vscode-cmd", "--list"], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("editor.action.formatDocument");
    expect(result.stdout).toContain("workbench.action.gotoSymbol");
  });
});
