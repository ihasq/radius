/**
 * Phase 4: VSCode Extension API スタブテスト
 *
 * vscode オブジェクトのスタブを実装し、拡張の activate() を実行可能にする。
 */

import { test, expect, describe } from "bun:test";

describe("VSCode Stub API", () => {
  test("T01: vscode.languages.registerCompletionItemProvider が関数", async () => {
    const vscode = await import("../src/vscode-stub/index");
    expect(typeof vscode.languages.registerCompletionItemProvider).toBe("function");
  });

  test("T02: vscode.commands.registerCommand が handler を登録", async () => {
    const vscode = await import("../src/vscode-stub/index");
    const handler = () => "test";
    const disposable = vscode.commands.registerCommand("test.command", handler);
    expect(disposable).toBeDefined();
    expect(typeof disposable.dispose).toBe("function");
  });

  test("T03: vscode.workspace.getConfiguration が空設定を返す", async () => {
    const vscode = await import("../src/vscode-stub/index");
    const config = vscode.workspace.getConfiguration();
    expect(config).toBeDefined();
    expect(typeof config.get).toBe("function");
  });

  test("T04: vscode.window.createTreeView が no-op を返す", async () => {
    const vscode = await import("../src/vscode-stub/index");
    const treeView = vscode.window.createTreeView("test", { treeDataProvider: {} as any });
    expect(treeView).toBeDefined();
    expect(typeof treeView.dispose).toBe("function");
  });

  test("T05: vscode.window.showInformationMessage が何もしない", async () => {
    const vscode = await import("../src/vscode-stub/index");
    const result = vscode.window.showInformationMessage("test");
    expect(result).toBeDefined();
  });

  test("T06: vscode.debug.startDebugging が存在する", async () => {
    const vscode = await import("../src/vscode-stub/index");
    expect(typeof vscode.debug.startDebugging).toBe("function");
  });

  test("T07: vscode.env.shell が文字列を返す", async () => {
    const vscode = await import("../src/vscode-stub/index");
    expect(typeof vscode.env.shell).toBe("string");
    expect(vscode.env.shell.length).toBeGreaterThan(0);
  });

  test("T08: activate(context) が拡張のコマンドを登録する", async () => {
    const vscode = await import("../src/vscode-stub/index");
    const { activateExtension } = await import("../src/extension-host/activator");

    // モック拡張
    const mockExtension = {
      activate: (context: any) => {
        context.subscriptions.push(
          vscode.commands.registerCommand("mock.test", () => "activated")
        );
      },
    };

    const context = { subscriptions: [] as any[] };
    await activateExtension(mockExtension, context);

    expect(context.subscriptions.length).toBeGreaterThan(0);
  });

  test("T09: 登録されたコマンドが radius CLI から呼び出せる", async () => {
    const vscode = await import("../src/vscode-stub/index");

    // コマンド登録
    let called = false;
    vscode.commands.registerCommand("test.cli", () => {
      called = true;
      return "success";
    });

    // コマンド実行（内部API経由）
    const { executeCommand } = await import("../src/vscode-stub/commands");
    const result = await executeCommand("test.cli");

    expect(called).toBe(true);
    expect(result).toBe("success");
  });

  test("T10: no-op API 呼び出しでエラーが発生しない", async () => {
    const vscode = await import("../src/vscode-stub/index");

    // 複数の no-op API を呼び出してもエラーにならない
    expect(() => {
      vscode.window.showErrorMessage("test");
      vscode.window.showWarningMessage("test");
      vscode.window.setStatusBarMessage("test");
      vscode.workspace.onDidChangeConfiguration(() => {});
      vscode.window.createOutputChannel("test");
    }).not.toThrow();
  });
});
