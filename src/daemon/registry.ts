/**
 * Daemon ハンドラレジストリ。
 *
 * ハンドラ登録を宣言的に行う。
 */

import { handleReadVar } from "../core/commands/read-var";
import { handleModifyVar } from "../core/commands/modify-var";
import { handleUndo } from "../core/commands/undo";
import { handleRedo } from "../core/commands/redo";
import { handleSolveConflict } from "../core/commands/solve-conflict";
import { handleRenameFile } from "../core/commands/rename-file";
import { handleExtInstall, handleExtList, handleExtRemove } from "../core/commands/ext";
import { handleView } from "../core/commands/view";
import { handleStrReplace } from "../core/commands/str-replace";
import { handleCreate } from "../core/commands/create";
import { handleInsert } from "../core/commands/insert";
import { handleLspList } from "../core/commands/lsp";
import { findProjectRoot } from "../shared/project";
import type { IpcResponse } from "../shared/types";
import type { LspManager } from "../lsp/manager";
import type { HistoryTracker } from "../core/history/tracker";
import type { ExtensionRegistry } from "../extension-host/registry";
import type { ExtensionLoader } from "../extension-host/loader";
import type { BufferManager } from "../core/buffer/manager";

/** デーモンコンテキスト。 */
export interface DaemonContext {
  lspManager: LspManager;
  getHistoryTracker(projectRoot: string): HistoryTracker;
  extensionRegistry: ExtensionRegistry;
  extensionLoader: ExtensionLoader;
  bufferManager: BufferManager;
}

/** ハンドラ定義。 */
export interface HandlerDef {
  command: string;
  handler: (args: Record<string, unknown>, ctx: DaemonContext) => Promise<IpcResponse>;
}

/** ハンドラ定義一覧。 */
export const handlers: HandlerDef[] = [
  {
    command: "ping",
    handler: async () => {
      return { ok: true, data: "pong" };
    },
  },
  {
    command: "shutdown",
    handler: async () => {
      // shutdown は daemon/main.ts で特別に処理される
      return { ok: true, data: "shutting down" };
    },
  },
  {
    command: "read-var",
    handler: async (args, ctx) => {
      return await handleReadVar(args, ctx.lspManager, ctx.bufferManager);
    },
  },
  {
    command: "modify-var",
    handler: async (args, ctx) => {
      const filePath = args.file as string | undefined;
      if (!filePath) {
        return { ok: false, error: "Missing required arg: file" };
      }
      const projectRoot = findProjectRoot(filePath);
      const historyTracker = ctx.getHistoryTracker(projectRoot);
      return await handleModifyVar(args, ctx.lspManager, historyTracker, ctx.bufferManager);
    },
  },
  {
    command: "undo",
    handler: async (args, ctx) => {
      const cwd = args.cwd as string | undefined;
      if (!cwd) {
        return { ok: false, error: "Missing required arg: cwd" };
      }
      const projectRoot = findProjectRoot(cwd);
      const historyTracker = ctx.getHistoryTracker(projectRoot);
      return await handleUndo(args, ctx.lspManager, historyTracker);
    },
  },
  {
    command: "redo",
    handler: async (args, ctx) => {
      const cwd = args.cwd as string | undefined;
      if (!cwd) {
        return { ok: false, error: "Missing required arg: cwd" };
      }
      const projectRoot = findProjectRoot(cwd);
      const historyTracker = ctx.getHistoryTracker(projectRoot);
      return await handleRedo(args, ctx.lspManager, historyTracker);
    },
  },
  {
    command: "solve-conflict",
    handler: async (args, ctx) => {
      const filePath = args.file as string | undefined;
      if (!filePath) {
        return { ok: false, error: "Missing required arg: file" };
      }
      const projectRoot = findProjectRoot(filePath);
      const historyTracker = ctx.getHistoryTracker(projectRoot);
      return await handleSolveConflict(args, ctx.lspManager, historyTracker, ctx.bufferManager);
    },
  },
  {
    command: "rename-file",
    handler: async (args, ctx) => {
      return await handleRenameFile(args, ctx);
    },
  },
  {
    command: "ext-install",
    handler: async (args, ctx) => {
      return await handleExtInstall(args, ctx.extensionRegistry, ctx.extensionLoader);
    },
  },
  {
    command: "ext-list",
    handler: async (args, ctx) => {
      return await handleExtList(args, ctx.extensionRegistry);
    },
  },
  {
    command: "ext-remove",
    handler: async (args, ctx) => {
      return await handleExtRemove(args, ctx.extensionRegistry);
    },
  },
  {
    command: "view",
    handler: async (args, ctx) => {
      return await handleView(args, ctx.bufferManager);
    },
  },
  {
    command: "str-replace",
    handler: async (args, ctx) => {
      const filePath = args.file as string | undefined;
      if (!filePath) {
        return { ok: false, error: "Missing required arg: file" };
      }
      const projectRoot = findProjectRoot(filePath);
      const historyTracker = ctx.getHistoryTracker(projectRoot);
      return await handleStrReplace(args, ctx.lspManager, historyTracker, ctx.bufferManager);
    },
  },
  {
    command: "create",
    handler: async (args, ctx) => {
      const filePath = args.file as string | undefined;
      if (!filePath) {
        return { ok: false, error: "Missing required arg: file" };
      }
      const projectRoot = findProjectRoot(filePath);
      const historyTracker = ctx.getHistoryTracker(projectRoot);
      return await handleCreate(args, ctx.lspManager, historyTracker, ctx.bufferManager);
    },
  },
  {
    command: "insert",
    handler: async (args, ctx) => {
      const filePath = args.file as string | undefined;
      if (!filePath) {
        return { ok: false, error: "Missing required arg: file" };
      }
      const projectRoot = findProjectRoot(filePath);
      const historyTracker = ctx.getHistoryTracker(projectRoot);
      return await handleInsert(args, ctx.lspManager, historyTracker, ctx.bufferManager);
    },
  },
  {
    command: "lsp-list",
    handler: async (args, ctx) => {
      return await handleLspList(args, ctx.extensionLoader);
    },
  },
];

/**
 * コマンド名からハンドラを取得する。
 */
export function findHandler(command: string): HandlerDef | undefined {
  return handlers.find((h) => h.command === command);
}
