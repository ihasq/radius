/**
 * Phase 6: DAP (Debug Adapter Protocol) 統合テスト
 *
 * デバッグ機能の実装を検証する。
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { radius } from "./helpers/radius";
import { join } from "path";

describe("DAP Integration", () => {
  const debugProject = join(process.cwd(), "tests/fixtures/debug-project");
  const mainFile = join(debugProject, "src/main.ts");

  test("T01: radius debug-start が DAP セッションを開始", async () => {
    const result = await radius(["debug-start", mainFile], { cwd: debugProject });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("debug session");
  });

  test("T02: radius breakpoint <file> --line N が設定可能", async () => {
    const result = await radius(["breakpoint", mainFile, "--line", "6"], { cwd: debugProject });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("breakpoint");
  });

  test("T03: radius debug-continue がプログラムを続行", async () => {
    const result = await radius(["debug-continue"], { cwd: debugProject });
    expect(result.exitCode).toBe(0);
  });

  test("T04: radius debug-step がステップ実行", async () => {
    const result = await radius(["debug-step"], { cwd: debugProject });
    expect(result.exitCode).toBe(0);
  });

  test("T05: radius inspect <expression> が変数値を返す", async () => {
    const result = await radius(["inspect", "num1"], { cwd: debugProject });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\d+/); // 数値が表示される
  });

  test("T06: radius debug-stop が DAP セッションを終了", async () => {
    const result = await radius(["debug-stop"], { cwd: debugProject });
    expect(result.exitCode).toBe(0);
  });

  test("T07: Node.js デバッガ (--inspect) に接続できる", async () => {
    // --inspect で起動されたプロセスへの接続をテスト
    const result = await radius(["debug-start", mainFile, "--attach"], { cwd: debugProject });
    expect(result.exitCode).toBe(0);
  });

  test("T08: DAP 子プロセスが radiusd で管理される", async () => {
    // デバッグセッション開始後、daemon がプロセスを管理していることを確認
    const startResult = await radius(["debug-start", mainFile], { cwd: debugProject });
    expect(startResult.exitCode).toBe(0);

    // セッション一覧で確認
    const listResult = await radius(["debug-list"], { cwd: debugProject });
    expect(listResult.stdout).toContain("debug session");
  });

  test("T09: デバッグセッション中のファイル情報が取得できる", async () => {
    const result = await radius(["debug-info"], { cwd: debugProject });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("main.ts");
  });

  test("T10: 複数ブレークポイントの管理が可能", async () => {
    // 複数ブレークポイント設定
    const bp1 = await radius(["breakpoint", mainFile, "--line", "6"], { cwd: debugProject });
    const bp2 = await radius(["breakpoint", mainFile, "--line", "11"], { cwd: debugProject });
    const bp3 = await radius(["breakpoint", mainFile, "--line", "21"], { cwd: debugProject });

    expect(bp1.exitCode).toBe(0);
    expect(bp2.exitCode).toBe(0);
    expect(bp3.exitCode).toBe(0);

    // ブレークポイント一覧
    const listResult = await radius(["breakpoint-list"], { cwd: debugProject });
    expect(listResult.stdout).toContain("line 6");
    expect(listResult.stdout).toContain("line 11");
    expect(listResult.stdout).toContain("line 21");
  });
});
