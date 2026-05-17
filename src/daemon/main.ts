/**
 * Radius Daemon (radiusd)
 *
 * Modes:
 * - Daemon mode (default): IPC server for handling CLI requests
 * - CLI mode (--exec): Transparent wrapper to CLI functionality
 */

import { writeFileSync, unlinkSync, existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { IpcServer } from "../ipc/server";
import { sendRequest } from "../ipc/client";
import { getPidPath, getSocketPath } from "../shared/paths";
import { findProjectRoot } from "../shared/project";
import { LspManager } from "../lsp/manager";
import { HistoryTracker } from "../core/history/tracker";
import { SessionManager } from "../core/session/manager";
import { ExtensionRegistry } from "../extension-host/registry";
import { ExtensionLoader } from "../extension-host/loader";
import { BufferManager } from "../core/buffer/manager";
import { handlers, type DaemonContext } from "./registry";
import { findCommand, generateUsage, buildRequestWithTag } from "../cli/registry";
import { readStdin, isStdinAvailable } from "../shared/stdin";
import { muted } from "../shared/colors";
import type { IpcResponse, IpcRequest } from "../shared/types";
import pkg from "../../package.json";

// ==================== CLI MODE ====================
// When invoked with --exec, run as CLI instead of daemon

/**
 * PIDファイルに記録されたプロセスが生存しているか確認する。
 */
function isDaemonProcessAlive(): boolean {
  const pidPath = getPidPath();
  if (!existsSync(pidPath)) return false;
  try {
    const pid = parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isDaemonRunning(): Promise<boolean> {
  if (!existsSync(getSocketPath())) return false;
  if (!isDaemonProcessAlive()) return false;
  const resp = await sendRequest({ command: "ping", args: {} }, 3000);
  return resp !== null && resp.ok;
}

/**
 * デーモンをバックグラウンドで起動する。
 */
async function ensureDaemon(): Promise<boolean> {
  if (await isDaemonRunning()) return true;

  // radiusd の解決優先順:
  // 1. 自分自身と同一ディレクトリの radiusd (バイナリ配布モード)
  // 2. PATH 上の radiusd
  // 3. 開発モード (bun run)

  let daemonCmd: string;
  let daemonArgs: string[] = [];

  // 1. 同一ディレクトリの radiusd を探す
  const radiusdName = process.platform === "win32" ? "radiusd.exe" : "radiusd";
  const radiusdPath = resolve(dirname(process.execPath), radiusdName);

  if (existsSync(radiusdPath)) {
    // バイナリ配布モード
    daemonCmd = radiusdPath;
  } else {
    // 2. PATH 上の radiusd を試す
    try {
      const { execSync } = require("node:child_process");
      execSync(`${process.platform === "win32" ? "where" : "which"} ${radiusdName}`, { stdio: "ignore" });
      daemonCmd = radiusdName;
    } catch {
      // 3. 開発モード
      daemonCmd = "bun";
      daemonArgs = ["run", resolve(import.meta.dir, "main.ts")];
    }
  }

  const child = spawn(daemonCmd, daemonArgs, {
    stdio: "ignore",
    detached: true,
  });
  child.unref();

  const maxWait = 5000;
  const interval = 100;
  let waited = 0;
  while (waited < maxWait) {
    await Bun.sleep(interval);
    waited += interval;
    if (await isDaemonRunning()) return true;
  }

  return false;
}

async function runCliMode(): Promise<void> {
  const args = process.argv.slice(3); // Skip: [bun/node, script, --exec]
  const commandName = args[0];

  // --help / --version フラグ
  if (commandName === "--help" || commandName === "-h") {
    console.log(generateUsage());
    console.log("  daemon stop                             デーモンの停止");
    process.exit(0);
  }

  if (commandName === "--version" || commandName === "-v") {
    console.log(pkg.version);
    process.exit(0);
  }

  // usage 表示
  if (!commandName) {
    console.log(generateUsage());
    console.log("  daemon stop                             デーモンの停止");
    process.exit(0);
  }

  // daemon stop は特殊コマンド
  if (commandName === "daemon" && args[1] === "stop") {
    const resp = await sendRequest({ command: "shutdown", args: {} });
    if (resp === null) {
      console.error("error: daemon is not running");
      process.exit(1);
    }
    console.log("daemon stopped");
    process.exit(0);
  }

  // コマンド検索
  const cmdDef = findCommand(commandName);
  if (!cmdDef) {
    console.error(`error: unknown command: ${commandName}`);
    console.log(generateUsage());
    process.exit(1);
  }

  // デーモン起動確認
  const running = await ensureDaemon();
  if (!running) {
    console.error("error: failed to start daemon");
    process.exit(1);
  }

  // --stdin オプションの処理
  let stdinContent: string | undefined;
  const hasStdinFlag = args.slice(1).includes("--stdin");
  if (hasStdinFlag) {
    if (!isStdinAvailable()) {
      console.error("error: --stdin specified but no input provided");
      process.exit(1);
    }
    stdinContent = await readStdin();
  }

  // リクエスト構築
  let request: IpcRequest;
  try {
    request = buildRequestWithTag(cmdDef, args.slice(1), process.cwd(), stdinContent);
  } catch (usageMessage) {
    console.error(usageMessage);
    process.exit(1);
  }

  // リクエスト送信
  const response = await sendRequest(request);
  if (response === null) {
    console.error("error: lost connection to daemon");
    process.exit(1);
  }

  // エラーハンドリング
  if (!response.ok) {
    console.error(`error: ${response.error}`);
    process.exit(1);
  }

  // 警告出力
  if (response.warnings && response.warnings.length > 0) {
    const { warning: colorWarning } = await import("../shared/colors");
    for (const warningText of response.warnings) {
      console.log(colorWarning(warningText));
    }
  }

  // データ出力
  if (response.data !== undefined) {
    if (typeof response.data === "string") {
      console.log(response.data);
    } else {
      console.log(JSON.stringify(response.data, null, 2));
    }
  }

  // タグ出力
  if (response.tag) {
    console.log(muted("\n---"));
    console.log(muted(`radius-tag: ${response.tag}`));
    console.log(muted(`[pass --tag ${response.tag} to your next radius command]`));
  }
}

// ==================== DAEMON MODE ====================

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

// ==================== ENTRY POINT ====================

// Check for --exec flag to determine mode
const isCliMode = process.argv.includes("--exec");

if (isCliMode) {
  // CLI mode: behave like radius CLI
  runCliMode().catch((err) => {
    console.error(`fatal: ${err.message}`);
    process.exit(1);
  });
} else {
  // Daemon mode: start IPC server
  startDaemon().catch((err) => {
    console.error(`[radiusd] Failed to start daemon: ${err}`);
    process.exit(1);
  });
}
