/**
 * Phase 5: vscode-cmd コマンドハンドラ
 *
 * VSCode コマンドパレット互換のコマンドを実行する。
 * editor.action.* および workbench.action.* を radius コマンドにマッピング。
 */

import type { IpcResponse } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import type { TsRadManager } from "../ts-rad/manager";
import { getCommandMapping, getAllCommandIds } from "../../vscode-stub/builtin-commands";
import { getCommands } from "../../vscode-stub/commands";
import { errorResponse } from "../../shared/output";
import { findHandler } from "../../daemon/registry";

/**
 * vscode-cmd コマンドハンドラ
 *
 * Usage:
 *   radius vscode-cmd <command-id> [args...]
 *   radius vscode-cmd --list
 */
export async function handleVscodeCmd(
  args: Record<string, unknown>,
  lspManager?: LspManager,
  bufferManager?: BufferManager,
  tsRadManager?: TsRadManager
): Promise<IpcResponse> {
  const positional = (args._ as string[]) || [];
  const list = args.list as boolean | undefined;

  // --list: 全登録コマンドID一覧を返す
  if (list) {
    const builtinIds = getAllCommandIds();
    const extensionIds = getCommands();
    const allIds = [...builtinIds, ...extensionIds];

    const output = [
      "=== VSCode Commands ===",
      "",
      "Built-in commands:",
      ...builtinIds.map((id) => `  ${id}`),
      "",
      "Extension commands:",
      ...extensionIds.map((id) => `  ${id}`),
      "",
      `Total: ${allIds.length} commands`,
    ].join("\n");

    return { ok: true, data: output };
  }

  // コマンドID を取得
  const commandId = positional[0];
  if (!commandId) {
    return errorResponse("Missing command ID. Usage: radius vscode-cmd <command-id> [args...]");
  }

  // Built-in コマンドマッピングを確認
  const mapping = getCommandMapping(commandId);
  if (!mapping) {
    return errorResponse(`Unknown VSCode command: ${commandId}\nUse --list to see available commands.`);
  }

  // radius コマンドに変換
  const radiusCommand = mapping.radiusCommand;
  const commandArgs = positional.slice(1); // コマンドID以降の引数
  const transformedArgs = mapping.transformArgs ? mapping.transformArgs(commandArgs) : commandArgs;

  // delegateとしてradiusコマンドを実行
  const handlerDef = findHandler(radiusCommand);
  if (!handlerDef) {
    return errorResponse(`Handler not found for radius command: ${radiusCommand}`);
  }

  // 新しい引数オブジェクトを構築
  // 多くのコマンドは第1引数をfileとして期待するため、変換する
  const newArgs: Record<string, unknown> = {
    _: transformedArgs,
    file: transformedArgs[0], // 第1引数をfileとして設定
    ...args, // 元の引数も引き継ぐ
  };

  // 追加の名前付き引数をパース（--flag value 形式）
  for (let i = 1; i < transformedArgs.length; i++) {
    const arg = transformedArgs[i];
    if (typeof arg === "string" && arg.startsWith("--")) {
      const key = arg.substring(2);
      const value = transformedArgs[i + 1];
      newArgs[key] = value;
      i++; // 次の値をスキップ
    }
  }

  // コンテキストを構築
  const ctx = {
    lspManager: lspManager!,
    bufferManager: bufferManager!,
    tsRadManager: tsRadManager!,
    lspClient: null, // 必要に応じて追加
  };

  // ハンドラを実行
  try {
    return await handlerDef.handler({ args: newArgs, cwd: process.cwd() } as any, ctx as any);
  } catch (err) {
    return errorResponse(`Failed to execute ${commandId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
