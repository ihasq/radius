/**
 * VSCode commands API スタブ
 *
 * コマンドの登録と実行を管理する。
 */

interface Disposable {
  dispose(): void;
}

type CommandHandler = (...args: any[]) => any;

/**
 * コマンドレジストリ（グローバル）
 */
const commandRegistry = new Map<string, CommandHandler>();

/**
 * コマンドを登録する
 */
export function registerCommand(command: string, callback: CommandHandler): Disposable {
  commandRegistry.set(command, callback);

  return {
    dispose: () => {
      commandRegistry.delete(command);
    },
  };
}

/**
 * コマンドを実行する（内部API）
 */
export async function executeCommand(command: string, ...args: any[]): Promise<any> {
  const handler = commandRegistry.get(command);
  if (!handler) {
    throw new Error(`Command not found: ${command}`);
  }
  return await handler(...args);
}

/**
 * 登録されているコマンド一覧を取得
 */
export function getCommands(): string[] {
  return Array.from(commandRegistry.keys());
}
