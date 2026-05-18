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
import { ChangeLedger } from "../core/agent/ledger";
import { ConflictManager } from "../core/agent/conflict";
import { DiagnosticRegistry } from "../lsp/diagnostic-registry";
import { handlers, type DaemonContext } from "./registry";
import { findCommand, generateUsage, buildRequestWithTag } from "../cli/registry";
import { readStdin, isStdinAvailable } from "../shared/stdin";
import { muted } from "../shared/colors";
import type { IpcResponse, IpcRequest } from "../shared/types";
import pkg from "../../package.json";
import { debug, debugTime } from "../shared/debug";

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
const ledgers = new Map<string, ChangeLedger>();
const conflictManagers = new Map<string, ConflictManager>();
const diagnosticRegistries = new Map<string, DiagnosticRegistry>();
let idleTimer: ReturnType<typeof setTimeout>;

/** プロジェクトルート・チェーンIDに対応する HistoryTracker を取得 */
function getHistoryTracker(projectRoot: string, chainId: string): HistoryTracker {
  const key = `${projectRoot}:${chainId}`;
  let tracker = historyTrackers.get(key);
  if (!tracker) {
    tracker = new HistoryTracker(projectRoot, chainId);
    historyTrackers.set(key, tracker);
  }
  return tracker;
}

/** プロジェクトルート・チェーンIDに対応する SessionManager を取得 */
function getSessionManager(projectRoot: string, chainId: string): SessionManager {
  const key = `${projectRoot}:${chainId}`;
  let manager = sessionManagers.get(key);
  if (!manager) {
    manager = new SessionManager(projectRoot, chainId);
    sessionManagers.set(key, manager);
  }
  return manager;
}

/** プロジェクトルートに対応する ChangeLedger を取得 */
function getLedger(projectRoot: string): ChangeLedger {
  let ledger = ledgers.get(projectRoot);
  if (!ledger) {
    ledger = new ChangeLedger(projectRoot);
    ledgers.set(projectRoot, ledger);
  }
  return ledger;
}

/** プロジェクトルートに対応する ConflictManager を取得 */
function getConflictManager(projectRoot: string): ConflictManager {
  let manager = conflictManagers.get(projectRoot);
  if (!manager) {
    const ledger = getLedger(projectRoot);
    manager = new ConflictManager(projectRoot, ledger);
    conflictManagers.set(projectRoot, manager);
  }
  return manager;
}

/** プロジェクトルートに対応する DiagnosticRegistry を取得 */
function getDiagnosticRegistry(projectRoot: string): DiagnosticRegistry {
  let registry = diagnosticRegistries.get(projectRoot);
  if (!registry) {
    registry = new DiagnosticRegistry(projectRoot);
    registry.load();
    diagnosticRegistries.set(projectRoot, registry);
  }
  return registry;
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
  getLedger,
  getConflictManager,
  getDiagnosticRegistry,
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

        // Hotfix: タグからチェーンIDを解決
        const tag = request.tag;

        // Hotfix: --agent の非推奨警告
        const deprecationWarnings: string[] = [];
        if (request.args.agent !== undefined) {
          deprecationWarnings.push("warning: --agent is deprecated. Agent identity is determined by --tag.");
        }

        // タグからチェーンIDを解決（タグなし = 新しいチェーンを開始）
        const chainId = await SessionManager.resolveChainId(projectRoot, tag);
        const isWriteCommand = handlerDef.isWriteCommand ?? false;

        debug("cmd", `command=${request.command}, tag=${tag}, chainId=${chainId}`);

        // チェーン別のセッション・履歴マネージャを取得
        const sessionManager = getSessionManager(projectRoot, chainId);
        const historyTracker = getHistoryTracker(projectRoot, chainId);

        // 1. タグ検証と巻き戻し
        const { warnings, currentSeq, rejected } = await sessionManager.validateAndRewind(
          request.tag,
          historyTracker,
          lspManager,
          isWriteCommand
        );

        // 拒否された場合はエラーを返す（即座に）
        if (rejected) {
          const allWarnings = [...deprecationWarnings, ...warnings];
          return {
            ok: false,
            error: warnings[0],
            warnings: allWarnings.length > 0 ? allWarnings : undefined,
          };
        }

        // chainIdをrequestに追加（レジストリハンドラーで使用）
        (request as any).chainId = chainId;

        // 2. 通知配信（全コマンド実行前）
        const notificationMessages: string[] = [];
        const conflictManager = getConflictManager(projectRoot);
        const notifications = await conflictManager.getPendingNotifications(chainId);
        if (notifications.length > 0) {
          notificationMessages.push(`\n[chain ${chainId}] you have ${notifications.length} pending notification(s):`);
          for (const notif of notifications.slice(0, 3)) {
            notificationMessages.push(`  - [${notif.type}] ${notif.message}`);
          }
          if (notifications.length > 3) {
            notificationMessages.push(`  ... and ${notifications.length - 3} more.`);
          }
          notificationMessages.push("");
        }

        // 3. 書き込みコマンドの事前コンフリクト検知
        if (isWriteCommand) {
          const ledger = getLedger(projectRoot);

          // ファイルパスを取得
          let targetFiles: string[] = [];
          if (request.args.file) {
            targetFiles.push(request.args.file as string);
          }

          for (const filePath of targetFiles) {
            try {
              if (!existsSync(filePath)) continue;

              // ファイル内容を取得して行数を確認
              const content = bufferManager.getContent(filePath);
              const lineCount = content.split("\n").length;

              // 台帳から直近の変更を確認
              const recentChanges = await ledger.getRecentChanges(filePath, 30);
              const otherChainChanges = recentChanges.filter(entry => entry.chainId !== chainId);

              if (otherChainChanges.length > 0) {
                // コンフリクト検出
                const conflictCheck = await conflictManager.checkBeforeWrite(
                  chainId,
                  filePath,
                  1,
                  lineCount,
                  lineCount,
                  30
                );

                if (conflictCheck) {
                  const reason = request.args.reason as string | undefined;
                  if (!reason) {
                    // --reason がない場合は拒否し、重複箇所の内容を表示
                    let errorMessage = `${conflictCheck.message}\n`;
                    if (conflictCheck.overlapContent) {
                      errorMessage += `\noverlapping content:\n${conflictCheck.overlapContent}\n`;
                    }
                    errorMessage += `\nTo proceed, add --reason "<explanation>" to explain your change.`;
                    return {
                      ok: false,
                      error: errorMessage,
                    };
                  }
                  // --reason がある場合は警告付きで続行
                  warnings.push(`conflict warning: ${conflictCheck.message}`);
                }
              }
            } catch (err) {
              // エラーは無視して続行
              console.error(`[Phase 16] conflict check failed for ${filePath}:`, err);
            }
          }
        }

        // 4. 実ハンドラを呼び出し
        const endTimer = debugTime("cmd", request.command);
        const response = await handlerDef.handler(request, context);
        endTimer();

        // 5. 書き込みコマンドの事後処理（台帳記録）
        if (response.ok && isWriteCommand && response.changes) {
          const ledger = getLedger(projectRoot);
          const reason = request.args.reason as string | undefined;
          const latestChangesetId = await historyTracker.getLatestChangesetId();

          for (const change of response.changes) {
            // 台帳に記録
            const ledgerEntry = await ledger.record({
              chainId,
              filePath: change.filePath,
              timestamp: new Date().toISOString(),
              command: request.command,
              startLine: change.startLine,
              endLine: change.endLine,
              newEndLine: change.newEndLine,
              changesetId: latestChangesetId || null,
            });

            // 重複検知して overwrite を記録
            const overlaps = await ledger.findOverlaps(
              change.filePath,
              change.startLine,
              change.newEndLine,
              chainId,
              30
            );

            if (overlaps.length > 0) {
              for (const overlap of overlaps) {
                await conflictManager.recordOverwrite(
                  chainId,
                  ledgerEntry.id,
                  overlap.id,
                  change.filePath,
                  Math.max(change.startLine, overlap.startLine),
                  Math.min(change.newEndLine, overlap.newEndLine),
                  reason || "no reason provided"
                );
              }
            }
          }
        }

        // 成功時: タグを生成
        if (response.ok) {
          // 初回タグかどうか（currentSeqが0の状態で最初のタグを発行する場合）
          const isFirstTag = currentSeq === 0;

          let newTag: string;
          if (isWriteCommand) {
            // 書き込みコマンド: 無条件に advance() を呼び出す
            const latestChangesetId = await historyTracker.getLatestChangesetId();
            newTag = await sessionManager.advance(latestChangesetId || null);
          } else {
            // 読み取り専用コマンド: 現在のタグを返す
            newTag = await sessionManager.currentTag();
          }

          // 通知メッセージを data の先頭に追加
          let finalData = response.data;
          if (notificationMessages.length > 0 && typeof finalData === "string") {
            finalData = notificationMessages.join("\n") + finalData;
          }

          // 非推奨警告とvalidateAndRewindからの警告をマージ
          const allWarnings = [...deprecationWarnings, ...warnings];

          return {
            ...response,
            data: finalData,
            tag: newTag,
            isFirstTag,
            warnings: allWarnings.length > 0 ? allWarnings : undefined,
          };
        }

        // 失敗時もwarningsを含める（非推奨警告を含む）
        const allWarnings = [...deprecationWarnings, ...warnings];
        return {
          ...response,
          warnings: allWarnings.length > 0 ? allWarnings : undefined,
        };
      }

      // セッション検証不要なコマンド
      const endTimer = debugTime("cmd", request.command);
      const result = await handlerDef.handler(request, context);
      endTimer();
      return result;
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

// Check for --verify-signature flag (used by radiusd shell script for signature verification)
if (process.argv.includes("--verify-signature")) {
  const idx = process.argv.indexOf("--verify-signature");
  const [gzPath, sigPath, pubPath] = process.argv.slice(idx + 1);

  if (!gzPath || !sigPath || !pubPath) {
    console.error("usage: radiusd --verify-signature <gz-file> <sig-file> <pub-file>");
    process.exit(1);
  }

  import("../shared/crypto").then(async ({ verifySignature }) => {
    try {
      const gz = readFileSync(gzPath);
      const sig = readFileSync(sigPath);
      const pub = JSON.parse(readFileSync(pubPath, "utf-8"));
      const valid = await verifySignature(gz, sig, pub);
      process.exit(valid ? 0 : 1);
    } catch (err) {
      console.error(`signature verification error: ${err}`);
      process.exit(1);
    }
  });
} else {
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
}
