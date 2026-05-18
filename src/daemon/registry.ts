/**
 * Daemon ハンドラレジストリ。
 * Hotfix: タグチェーンベースのエージェント識別
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
import { handleGraph } from "../core/commands/graph";
import { handleGrep } from "../core/commands/grep";
import { handleReplace } from "../core/commands/replace";
import { handleReplaceAll } from "../core/commands/replace-all";
import { handleAcceptChange } from "../core/commands/accept-change";
import { handleChallengeChange } from "../core/commands/challenge-change";
import { handleListNotifications } from "../core/commands/list-notifications";
import { handleFix } from "../core/commands/fix";
import { handleFormat } from "../core/commands/format";
import { handleOutline } from "../core/commands/outline";
import { handleHover } from "../core/commands/hover";
import { handleProblems } from "../core/commands/problems";
import { handleTypeHierarchy } from "../core/commands/typehierarchy";
import { handleDiff } from "../core/commands/diff";
import { handleCodeLens } from "../core/commands/codelens";
import { handleComment } from "../core/commands/comment";
import { handleSnippet } from "../core/commands/snippet";
import { handleTokens } from "../core/commands/tokens";
import { handleTask } from "../core/commands/task";
import { findProjectRoot } from "../shared/project";
import type { IpcRequest, IpcResponse } from "../shared/types";
import type { LspManager } from "../lsp/manager";
import type { HistoryTracker } from "../core/history/tracker";
import type { SessionManager } from "../core/session/manager";
import type { ExtensionRegistry } from "../extension-host/registry";
import type { ExtensionLoader } from "../extension-host/loader";
import type { BufferManager } from "../core/buffer/manager";
import type { ChangeLedger } from "../core/agent/ledger";
import type { ConflictManager } from "../core/agent/conflict";
import type { DiagnosticRegistry } from "../lsp/diagnostic-registry";

/** デーモンコンテキスト。 */
export interface DaemonContext {
  lspManager: LspManager;
  getHistoryTracker(projectRoot: string, chainId: string): HistoryTracker;
  getSessionManager(projectRoot: string, chainId: string): SessionManager;
  getLedger(projectRoot: string): ChangeLedger;
  getConflictManager(projectRoot: string): ConflictManager;
  getDiagnosticRegistry(projectRoot: string): DiagnosticRegistry;
  extensionRegistry: ExtensionRegistry;
  extensionLoader: ExtensionLoader;
  bufferManager: BufferManager;
}

/** ハンドラ定義。 */
export interface HandlerDef {
  command: string;
  handler: (request: IpcRequest, ctx: DaemonContext) => Promise<IpcResponse>;
  /** セッション検証を行うかどうか（デフォルト: false）。 */
  requiresSession?: boolean;
  /** ファイル変更を伴うコマンドかどうか（デフォルト: false）。 */
  isWriteCommand?: boolean;
}

/** ハンドラ定義一覧。 */
export const handlers: HandlerDef[] = [
  {
    command: "ping",
    handler: async (_request) => {
      return { ok: true, data: "pong" };
    },
  },
  {
    command: "shutdown",
    handler: async (_request) => {
      // shutdown は daemon/main.ts で特別に処理される
      return { ok: true, data: "shutting down" };
    },
  },
  {
    command: "read-var",
    requiresSession: true,
    handler: async (request, ctx) => {
      return await handleReadVar(request.args, ctx.lspManager, ctx.bufferManager);
    },
  },
  {
    command: "modify-var",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      const filePath = request.args.file as string | undefined;
      if (!filePath) {
        return { ok: false, error: "Missing required arg: file" };
      }
      const projectRoot = findProjectRoot(filePath);
      const chainId = (request as any).chainId as string;
      const historyTracker = ctx.getHistoryTracker(projectRoot, chainId);
      const diagnosticRegistry = ctx.getDiagnosticRegistry(projectRoot);
      return await handleModifyVar(request.args, ctx.lspManager, historyTracker, ctx.bufferManager, diagnosticRegistry);
    },
  },
  {
    command: "undo",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      const cwd = request.args.cwd as string | undefined;
      if (!cwd) {
        return { ok: false, error: "Missing required arg: cwd" };
      }
      const projectRoot = findProjectRoot(cwd);
      const chainId = (request as any).chainId as string;
      const historyTracker = ctx.getHistoryTracker(projectRoot, chainId);
      return await handleUndo(request.args, ctx.lspManager, historyTracker);
    },
  },
  {
    command: "redo",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      const cwd = request.args.cwd as string | undefined;
      if (!cwd) {
        return { ok: false, error: "Missing required arg: cwd" };
      }
      const projectRoot = findProjectRoot(cwd);
      const chainId = (request as any).chainId as string;
      const historyTracker = ctx.getHistoryTracker(projectRoot, chainId);
      return await handleRedo(request.args, ctx.lspManager, historyTracker);
    },
  },
  {
    command: "solve-conflict",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      const filePath = request.args.file as string | undefined;
      if (!filePath) {
        return { ok: false, error: "Missing required arg: file" };
      }
      const projectRoot = findProjectRoot(filePath);
      const chainId = (request as any).chainId as string;
      const historyTracker = ctx.getHistoryTracker(projectRoot, chainId);
      const diagnosticRegistry = ctx.getDiagnosticRegistry(projectRoot);
      return await handleSolveConflict(request.args, ctx.lspManager, historyTracker, ctx.bufferManager, diagnosticRegistry);
    },
  },
  {
    command: "rename-file",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      return await handleRenameFile(request, ctx);
    },
  },
  {
    command: "ext-install",
    handler: async (request, ctx) => {
      return await handleExtInstall(request.args, ctx.extensionRegistry, ctx.extensionLoader);
    },
  },
  {
    command: "ext-list",
    handler: async (request, ctx) => {
      return await handleExtList(request.args, ctx.extensionRegistry);
    },
  },
  {
    command: "ext-remove",
    handler: async (request, ctx) => {
      return await handleExtRemove(request.args, ctx.extensionRegistry);
    },
  },
  {
    command: "view",
    requiresSession: true,
    handler: async (request, ctx) => {
      return await handleView(request.args, ctx.bufferManager);
    },
  },
  {
    command: "str-replace",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      const filePath = request.args.file as string | undefined;
      if (!filePath) {
        return { ok: false, error: "Missing required arg: file" };
      }
      const projectRoot = findProjectRoot(filePath);
      const chainId = (request as any).chainId as string;
      const historyTracker = ctx.getHistoryTracker(projectRoot, chainId);
      const diagnosticRegistry = ctx.getDiagnosticRegistry(projectRoot);
      return await handleStrReplace(request.args, ctx.lspManager, historyTracker, ctx.bufferManager, diagnosticRegistry);
    },
  },
  {
    command: "create",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      const filePath = request.args.file as string | undefined;
      if (!filePath) {
        return { ok: false, error: "Missing required arg: file" };
      }
      const projectRoot = findProjectRoot(filePath);
      const chainId = (request as any).chainId as string;
      const historyTracker = ctx.getHistoryTracker(projectRoot, chainId);
      const diagnosticRegistry = ctx.getDiagnosticRegistry(projectRoot);
      return await handleCreate(request.args, ctx.lspManager, historyTracker, ctx.bufferManager, diagnosticRegistry);
    },
  },
  {
    command: "insert",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      const filePath = request.args.file as string | undefined;
      if (!filePath) {
        return { ok: false, error: "Missing required arg: file" };
      }
      const projectRoot = findProjectRoot(filePath);
      const chainId = (request as any).chainId as string;
      const historyTracker = ctx.getHistoryTracker(projectRoot, chainId);
      const diagnosticRegistry = ctx.getDiagnosticRegistry(projectRoot);
      return await handleInsert(request.args, ctx.lspManager, historyTracker, ctx.bufferManager, diagnosticRegistry);
    },
  },
  {
    command: "lsp-list",
    handler: async (request, ctx) => {
      return await handleLspList(request.args, ctx.extensionLoader);
    },
  },
  {
    command: "graph",
    requiresSession: true,
    handler: async (request, ctx) => {
      const filePath = request.args.file as string | undefined;
      if (!filePath) {
        return { ok: false, error: "Missing required arg: file" };
      }
      const projectRoot = findProjectRoot(filePath);
      return await handleGraph(request, ctx.lspManager, ctx.bufferManager, projectRoot);
    },
  },
  {
    command: "grep",
    requiresSession: true,
    handler: async (request, _ctx) => {
      return await handleGrep(request);
    },
  },
  {
    command: "replace",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      return await handleReplace(request, ctx);
    },
  },
  {
    command: "replace-all",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      return await handleReplaceAll(request, ctx);
    },
  },
  {
    command: "accept-change",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      return await handleAcceptChange(request, ctx);
    },
  },
  {
    command: "challenge-change",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      return await handleChallengeChange(request, ctx);
    },
  },
  {
    command: "list-notifications",
    requiresSession: true,
    handler: async (request, ctx) => {
      return await handleListNotifications(request, ctx);
    },
  },
  // Phase 17: Code Actions / Format
  {
    command: "fix",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      const filePath = request.args.file as string | undefined;
      if (!filePath) {
        return { ok: false, error: "Missing required arg: file" };
      }
      const projectRoot = findProjectRoot(filePath);
      const chainId = (request as any).chainId as string;
      const historyTracker = ctx.getHistoryTracker(projectRoot, chainId);
      const diagnosticRegistry = ctx.getDiagnosticRegistry(projectRoot);
      return await handleFix(request.args, ctx.lspManager, historyTracker, ctx.bufferManager, diagnosticRegistry);
    },
  },
  {
    command: "format",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      const filePath = request.args.file as string | undefined;
      if (!filePath) {
        return { ok: false, error: "Missing required arg: file" };
      }
      const projectRoot = findProjectRoot(filePath);
      const chainId = (request as any).chainId as string;
      const historyTracker = ctx.getHistoryTracker(projectRoot, chainId);
      const diagnosticRegistry = ctx.getDiagnosticRegistry(projectRoot);
      return await handleFormat(request.args, ctx.lspManager, historyTracker, ctx.bufferManager, diagnosticRegistry);
    },
  },
  // Phase 18: LLM可読ビュー
  {
    command: "outline",
    requiresSession: true,
    handler: async (request, ctx) => {
      return await handleOutline(request.args, ctx.lspManager, ctx.bufferManager);
    },
  },
  {
    command: "hover",
    requiresSession: true,
    handler: async (request, ctx) => {
      return await handleHover(request.args, ctx.lspManager, ctx.bufferManager);
    },
  },
  {
    command: "problems",
    requiresSession: true,
    handler: async (request, ctx) => {
      const cwd = request.cwd || process.cwd();
      return await handleProblems(request.args, ctx.lspManager, ctx.bufferManager, cwd);
    },
  },
  {
    command: "typehierarchy",
    requiresSession: true,
    handler: async (request, ctx) => {
      return await handleTypeHierarchy(request.args, ctx.lspManager, ctx.bufferManager);
    },
  },
  {
    command: "diff",
    requiresSession: true,
    handler: async (request, _ctx) => {
      return await handleDiff(request.args);
    },
  },
  {
    command: "codelens",
    requiresSession: true,
    handler: async (request, ctx) => {
      return await handleCodeLens(request.args, ctx.lspManager, ctx.bufferManager);
    },
  },
  // Phase 19: Language Configuration / Snippets / Semantic Tokens / Tasks
  {
    command: "comment",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      const filePath = request.args.file as string | undefined;
      if (!filePath) {
        return { ok: false, error: "Missing required arg: file" };
      }
      const projectRoot = findProjectRoot(filePath);
      const chainId = (request as any).chainId as string;
      const historyTracker = ctx.getHistoryTracker(projectRoot, chainId);
      const diagnosticRegistry = ctx.getDiagnosticRegistry(projectRoot);
      return await handleComment(request.args, ctx.lspManager, historyTracker, ctx.bufferManager, diagnosticRegistry);
    },
  },
  {
    command: "snippet",
    requiresSession: true,
    isWriteCommand: true,
    handler: async (request, ctx) => {
      const filePath = request.args.file as string | undefined;
      if (filePath) {
        const projectRoot = findProjectRoot(filePath);
        const chainId = (request as any).chainId as string;
        const historyTracker = ctx.getHistoryTracker(projectRoot, chainId);
        const diagnosticRegistry = ctx.getDiagnosticRegistry(projectRoot);
        return await handleSnippet(request.args, ctx.lspManager, historyTracker, ctx.bufferManager, diagnosticRegistry);
      }
      // --list mode doesn't require file
      return await handleSnippet(request.args, ctx.lspManager, null, ctx.bufferManager, null);
    },
  },
  {
    command: "tokens",
    requiresSession: true,
    handler: async (request, ctx) => {
      return await handleTokens(request.args, ctx.lspManager, ctx.bufferManager);
    },
  },
  {
    command: "task",
    requiresSession: true,
    handler: async (request, _ctx) => {
      const cwd = request.cwd || process.cwd();
      return await handleTask(request.args, cwd);
    },
  },
];

/**
 * コマンド名からハンドラを取得する。
 */
export function findHandler(command: string): HandlerDef | undefined {
  return handlers.find((h) => h.command === command);
}
