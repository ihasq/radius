import { writeFileSync, unlinkSync } from "node:fs";
import { IpcServer } from "../ipc/server";
import { getPidPath } from "../shared/paths";
import { findProjectRoot } from "../shared/project";
import { LspManager } from "../lsp/manager";
import { HistoryTracker } from "../core/history/tracker";
import { SessionManager } from "../core/session/manager";
import { ExtensionRegistry } from "../extension-host/registry";
import { ExtensionLoader } from "../extension-host/loader";
import { BufferManager } from "../core/buffer/manager";
import { handlers, type DaemonContext } from "./registry";
import type { IpcResponse } from "../shared/types";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

const server = new IpcServer();
const lspManager = new LspManager();
const extensionRegistry = new ExtensionRegistry();
const extensionLoader = new ExtensionLoader(extensionRegistry, lspManager);
const bufferManager = new BufferManager();
const historyTrackers = new Map<string, HistoryTracker>();
const sessionManagers = new Map<string, SessionManager>();
let idleTimer: ReturnType<typeof setTimeout>;

/** プロジェクトルートに対応する HistoryTracker を取得 */
function getHistoryTracker(projectRoot: string): HistoryTracker {
  let tracker = historyTrackers.get(projectRoot);
  if (!tracker) {
    tracker = new HistoryTracker(projectRoot);
    historyTrackers.set(projectRoot, tracker);
  }
  return tracker;
}

/** プロジェクトルートに対応する SessionManager を取得 */
function getSessionManager(projectRoot: string): SessionManager {
  let manager = sessionManagers.get(projectRoot);
  if (!manager) {
    manager = new SessionManager(projectRoot);
    sessionManagers.set(projectRoot, manager);
  }
  return manager;
}

function resetIdleTimer(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.log("[radiusd] idle timeout reached, shutting down");
    shutdown();
  }, IDLE_TIMEOUT_MS);
}

async function shutdown(): Promise<void> {
  await lspManager.stopAll();
  bufferManager.closeAll();
  server.stop();
  try {
    unlinkSync(getPidPath());
  } catch {
    // 無視。
  }
  process.exit(0);
}

process.on("SIGTERM", () => {
  console.log("[radiusd] received SIGTERM");
  shutdown();
});
process.on("SIGINT", () => {
  console.log("[radiusd] received SIGINT");
  shutdown();
});

server.onActivity = resetIdleTimer;

// --- 拡張ホスト初期化 ---

// LspManager に ExtensionLoader を設定
lspManager.setExtensionLoader(extensionLoader);

// 全拡張をロード（activate() を呼び出す）
async function initializeExtensions(): Promise<void> {
  try {
    await extensionLoader.loadAll();
  } catch (err) {
    console.error(`[radiusd] Failed to load extensions: ${err}`);
  }
}

// --- A: コ���ンド登録（レジストリベース） ---

// デーモンコンテキストの構築
const context: DaemonContext = {
  lspManager,
  getHistoryTracker,
  getSessionManager,
  extensionRegistry,
  extensionLoader,
  bufferManager,
};

// ハンドラ一括登録（セッション管理統合）
for (const handlerDef of handlers) {
  if (handlerDef.command === "shutdown") {
    // shutdown は特別処理（非同期シャットダウン）
    server.registerHandler("shutdown", (): IpcResponse => {
      setTimeout(() => shutdown(), 100);
      return { ok: true, data: "shutting down" };
    });
  } else {
    server.registerHandler(handlerDef.command, async (request) => {
      // セッション検証が必要なコマンドの場合
      if (handlerDef.requiresSession) {
        // cwd からプロジェクトルートを決定
        const cwd = request.cwd || process.cwd();
        const projectRoot = findProjectRoot(cwd);
        const sessionManager = getSessionManager(projectRoot);
        const historyTracker = getHistoryTracker(projectRoot);

        // タグ検証と巻き戻し
        const { warnings, currentSeq } = await sessionManager.validateAndRewind(
          request.tag,
          historyTracker,
          lspManager
        );

        // 実ハンドラを呼び出し
        const response = await handlerDef.handler(request, context);

        // 成功時: タグを生成
        if (response.ok) {
          // ファイル変更を伴うコマンドかどうかを判定
          // undo/redo, view, read-var は現在のタグを返す
          // それ以外は advance して新しいタグを生成
          const isReadOnlyCommand =
            handlerDef.command === "view" || handlerDef.command === "read-var";

          let newTag: string;
          if (isReadOnlyCommand) {
            newTag = sessionManager.currentTag();
          } else {
            // 最新の changeset ID を取得
            const latestChangesetId = await historyTracker.getLatestChangesetId();
            if (latestChangesetId) {
              newTag = sessionManager.advance(latestChangesetId);
            } else {
              // changeset がない場合は現在のタグを返す
              newTag = sessionManager.currentTag();
            }
          }

          return {
            ...response,
            tag: newTag,
            warnings: warnings.length > 0 ? warnings : undefined,
          };
        }

        // 失敗時もwarningsを含める
        return {
          ...response,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      }

      // セッション検証不要なコマンド
      return await handlerDef.handler(request, context);
    });
  }
}

// --- 起動 ---

async function startDaemon(): Promise<void> {
  // 拡張をロード
  await initializeExtensions();

  writeFileSync(getPidPath(), String(process.pid));
  server.start();
  resetIdleTimer();

  console.log(
    `[radiusd] daemon started (pid: ${process.pid}, idle timeout: ${IDLE_TIMEOUT_MS / 1000}s)`
  );
}

startDaemon().catch((err) => {
  console.error(`[radiusd] Failed to start daemon: ${err}`);
  process.exit(1);
});
