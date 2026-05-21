/**
 * Extension Host Activator
 *
 * VSCode 拡張の activate() 関数を実行するエンジン。
 * vscode スタブを注入して拡張を起動する。
 */

interface ExtensionContext {
  subscriptions: any[];
  workspaceState?: any;
  globalState?: any;
  extensionPath?: string;
  storagePath?: string;
  globalStoragePath?: string;
  logPath?: string;
}

interface Extension {
  activate: (context: ExtensionContext) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

/**
 * 拡張を activate する
 *
 * @param extension - activate 関数を持つ拡張オブジェクト
 * @param context - ExtensionContext（subscriptions配列を含む）
 */
export async function activateExtension(extension: Extension, context: ExtensionContext): Promise<void> {
  if (typeof extension.activate !== "function") {
    throw new Error("Extension must have an activate function");
  }

  await extension.activate(context);
}

/**
 * デフォルトの ExtensionContext を作成
 */
export function createExtensionContext(): ExtensionContext {
  return {
    subscriptions: [],
    workspaceState: {
      get: (key: string) => undefined,
      update: (key: string, value: any) => Promise.resolve(),
    },
    globalState: {
      get: (key: string) => undefined,
      update: (key: string, value: any) => Promise.resolve(),
    },
    extensionPath: process.cwd(),
    storagePath: "/tmp/radius-extensions",
    globalStoragePath: "/tmp/radius-extensions-global",
    logPath: "/tmp/radius-extensions-logs",
  };
}
