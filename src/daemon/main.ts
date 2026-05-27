/**
 * Radius Daemon (radiusd)
 *
 * Modes:
 * - Daemon mode (default): IPC server for handling CLI requests
 * - CLI mode (--exec): Transparent wrapper to CLI functionality
 */

import { writeFileSync, unlinkSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { IpcServer } from "../ipc/server";
import { sendRequest } from "../ipc/client";
import { getPidPath, getSocketPath, getRadiusHome, resolveSessionId } from "../shared/paths";
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
import { TsRadManager } from "@radius/rdsx-ts/manager";
import { handlers, type DaemonContext } from "./registry";
import { findCommand, generateUsage, buildRequestWithTag } from "../cli/registry";
import { readStdin, isStdinAvailable } from "../shared/stdin";
import { muted, stripAnsi, shouldStripColors } from "../shared/colors";
import { getTip } from "../cli/tips";
import type { IpcResponse, IpcRequest } from "../shared/types";
import pkg from "../../package.json";
import { debug, debugTime } from "../shared/debug";
import { analyzeFileContext, formatContextSection } from "../shared/context";
import { analyzeImpact, formatImpactSection } from "../shared/impact";
import { analyzeConventions, formatConventionsSection } from "../shared/conventions";

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
    env: {
      ...process.env,
      RADIUS_HOME: process.env.RADIUS_HOME || "",
      RADIUS_DEBUG: process.env.RADIUS_DEBUG || "",
      RADIUS_RELEASE_HASH: process.env.RADIUS_RELEASE_HASH || "",
    },
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
    // セッションIDを解決（RADIUS_SESSION env var → file → 新規生成）
    const sessionId = resolveSessionId();
    request = buildRequestWithTag(cmdDef, args.slice(1), process.cwd(), stdinContent, sessionId);
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

  // 出力フォーマット判定（JSON モードはエラー/警告含めて全出力を構造化）
  const outputFormat = process.env.RADIUS_FORMAT || "default";
  if (outputFormat === "json") {
    const jsonOutput: Record<string, unknown> = {
      ok: response.ok,
    };
    if (response.data !== undefined) jsonOutput.data = response.data;
    if (response.warnings) jsonOutput.warnings = response.warnings;
    if (response.error) jsonOutput.error = response.error;
    console.log(JSON.stringify(jsonOutput));
    process.exit(response.ok ? 0 : 1);
  }

  // エラーハンドリング
  if (!response.ok) {
    console.error(`error: ${response.error}`);
    // tips 追加（--help 指定時は除外）
    if (!args.includes("--help") && !args.includes("-h")) {
      const tip = getTip(commandName, response.error || "");
      if (tip) {
        console.error(tip);
      }
    }
    process.exit(1);
  }

  // 警告出力
  if (response.warnings && response.warnings.length > 0) {
    const { warning: colorWarning } = await import("../shared/colors");
    for (const warningText of response.warnings) {
      console.log(colorWarning(warningText));
    }
  }

  // データ出力（compact / default 共通）
  if (response.data !== undefined) {
    if (typeof response.data === "string") {
      // NO_COLOR が設定されている場合はANSIコードを除去
      const output = shouldStripColors() ? stripAnsi(response.data) : response.data;
      console.log(output);
    } else {
      console.log(JSON.stringify(response.data, null, 2));
    }
  }

  // 成功時tips（compact/jsonでは抑制）
  if (outputFormat === "default" && response.data !== undefined && typeof response.data === "string") {
    const { getSuccessTip } = await import("../cli/tips");
    const successTip = getSuccessTip(commandName, response.data);
    if (successTip) {
      console.error(successTip);
    }
  }

  // タグ出力（compact / json モードでは抑制）
  if (response.tag && outputFormat === "default") {
    const tagHistory = response.tagHistory || [];
    const historyLength = tagHistory.length;

    console.log(muted("\n---"));
    console.log(`radius-tag: ${response.tag}`);
    console.log("");

    // チェーン可視化
    if (historyLength <= 1) {
      // 初回: Welcome メッセージ + chain: tag1 (矢印なし)
      if (response.isFirstTag) {
        console.log(muted("> **Welcome to Radius.** Every edit command returns a radius-tag."));
        console.log(muted("> Pass it to your next command with --tag to maintain edit continuity."));
        console.log(muted("> Radius tracks your edits as a chain — if another editor modifies"));
        console.log(muted("> the same file, you will be notified."));
        console.log("");
      }

      console.log(muted(`chain: ${response.tag}`));
      console.log("");
      console.log(muted("> Tags rotate on every command. Always pass the latest tag."));
      console.log(muted("> `--reason` is a note to OTHER editors when you override their work."));
      console.log("");
      console.log(muted("> **`--tag " + response.tag + "` is mandatory for every subsequent command.**"));
      console.log(muted("> This tag links your edits into a single chain. Other editors monitoring this file"));
      console.log(muted("> will see your chain as one coherent operation."));
      console.log(muted(">"));
      console.log(muted("> **If you need to edit a file that another editor is also modifying:**"));
      console.log(muted("> Pass `--reason \"why you are overriding\"` — this notifies the other editor"));
      console.log(muted("> that you have intentionally overwritten their work, and why."));
      console.log(muted("> `--reason` is a message TO THEM, not to Radius."));
    } else if (historyLength <= 4) {
      // 2-4回: chain: tag1 → tag2 → tag3 + マーカー
      const chain = tagHistory.join(" → ");
      console.log(muted(`chain: ${chain}`));

      // マーカー位置計算（最後のタグの下）
      const lastTagStartPos = chain.lastIndexOf(response.tag);
      const spaces = " ".repeat("chain: ".length + lastTagStartPos);
      const carets = "^".repeat(response.tag.length);
      console.log(muted(`${spaces}${carets} use this`));
    } else {
      // 5回以上: ...→ tagN-2 → tagN-1 → tagN + マーカー
      const recentTags = tagHistory.slice(-3);
      const chain = "... → " + recentTags.join(" → ");
      console.log(muted(`chain: ${chain}`));

      // マーカー位置計算
      const lastTagStartPos = chain.lastIndexOf(response.tag);
      const spaces = " ".repeat("chain: ".length + lastTagStartPos);
      const carets = "^".repeat(response.tag.length);
      console.log(muted(`${spaces}${carets} use this`));
    }

    // Command suggestions
    if (response.tag && response.data && typeof response.data === "string") {
      const { getSuggestions } = await import("../core/suggest/engine");

      // Extract primary file from args (most commands have file as first arg)
      let fileArg = args.find((arg: string) => !arg.startsWith("--") && arg !== commandName);

      // For create-all, extract file from response data
      if (!fileArg && commandName === "create-all") {
        const createdMatch = response.data.match(/created: (.+\.(?:ts|js|tsx|jsx|rs|cpp|go|zig))/);
        if (createdMatch) {
          fileArg = createdMatch[1];
        }
      }

      if (fileArg) {
        const suggestions = getSuggestions(
          commandName,
          response.data,
          fileArg,
          response.tag
        );

        if (suggestions.length > 0) {
          console.log(muted("> suggested:"));
          for (const suggestion of suggestions) {
            console.log(muted(`>   ${suggestion}`));
          }
        }
      }
    }
  }
}

// ==================== DAEMON MODE ====================

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/** LSP クライアントを必要とするコマンド一覧（LSP APIを直接呼ぶコマンドのみ） */
const LSP_COMMANDS = new Set<string>();

import { RdsxRegistry } from "../rdsx/registry";
import { TsRadProvider } from "../../packages/rdsx-ts/src/provider";
import { RustAdapter } from "../../packages/rdsx-rs/src/adapter";
import { CppRdsxAnalyzer } from "../../packages/rdsx-cpp/src/adapter";
import { GoRdsxAnalyzer } from "../../packages/rdsx-go/src/adapter";
import { ZigRdsxAnalyzer } from "../../packages/rdsx-zig/src/adapter";

const server = new IpcServer();
const lspManager = new LspManager();
const extensionRegistry = new ExtensionRegistry();
const extensionLoader = new ExtensionLoader(extensionRegistry, lspManager);
const bufferManager = new BufferManager();
const tsRadManager = new TsRadManager();
const rdsxRegistry = new RdsxRegistry();
const historyTrackers = new Map<string, HistoryTracker>();
const sessionManagers = new Map<string, SessionManager>();
const ledgers = new Map<string, ChangeLedger>();
const conflictManagers = new Map<string, ConflictManager>();
const diagnosticRegistries = new Map<string, DiagnosticRegistry>();
let idleTimer: ReturnType<typeof setTimeout>;

// Register RDSX analyzers (activate will check if LSP server is available)
rdsxRegistry.register(new TsRadProvider());
rdsxRegistry.register(new RustAdapter("file:///"));
rdsxRegistry.register(new CppRdsxAnalyzer());
rdsxRegistry.register(new GoRdsxAnalyzer());
rdsxRegistry.register(new ZigRdsxAnalyzer());

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

let isShuttingDown = false;

async function cleanup(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  await lspManager.stopAll();
  bufferManager.closeAll();
  tsRadManager.disposeAll();
  // Deactivate all RDSX extensions
  await rdsxRegistry.deactivateAll();
  server.stop();
  try {
    unlinkSync(getPidPath());
  } catch {
    // 無視。
  }
}

async function shutdown(): Promise<void> {
  await cleanup();
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

// BufferManager に LspManager と TsRadManager を設定
bufferManager.setLspManager(lspManager);
bufferManager.setTsRadManager(tsRadManager);

// 全拡張をロード（activate() を呼び出す）
async function initializeExtensions(): Promise<void> {
  try {
    await extensionLoader.loadAll();
  } catch (err) {
    console.error(`[radiusd] Failed to load extensions: ${err}`);
  }
}

// --- A: コ���ンド登録（レジストリベース） ---

// デーモンコンテキストの構築（lspClient はリクエストごとに設定）
const baseContext: Omit<DaemonContext, "lspClient"> = {
  lspManager,
  getHistoryTracker,
  getSessionManager,
  getLedger,
  getConflictManager,
  getDiagnosticRegistry,
  extensionRegistry,
  extensionLoader,
  bufferManager,
  tsRadManager,
  rdsxRegistry,
};

// ハンドラ一括登録（セッション管理統合）
for (const handlerDef of handlers) {
  if (handlerDef.command === "shutdown") {
    // shutdown は特別処理（非同期シャットダウン）
    server.registerHandler("shutdown", async (): Promise<IpcResponse> => {
      await cleanup();
      // cleanup 完了後、少し待ってからプロセス終了（レスポンス送信時間を確保）
      setTimeout(() => process.exit(0), 100);
      return { ok: true, data: "shutdown complete" };
    });
  } else {
    server.registerHandler(handlerDef.command, async (request) => {
      // セッション検証が必要なコマンドの場合
      if (handlerDef.requiresSession) {
        // ファイルパス優先でプロジェクトルートを決定（cwd はフォールバック）
        const cwd = request.cwd || process.cwd();
        const positionalArgs = request.args._ as string[] | undefined;
        const primaryFile = (request.args.file as string) || (request.args.path as string) || positionalArgs?.[0] || "";
        const projectRoot = findProjectRoot(primaryFile || cwd);

        // タグまたはセッションIDからチェーンIDを解決
        const tag = request.tag;
        const sessionId = request.sessionId;

        // Hotfix: --agent の非推奨警告
        const deprecationWarnings: string[] = [];
        if (request.args.agent !== undefined) {
          deprecationWarnings.push("warning: --agent is deprecated. Agent identity is determined by --tag or RADIUS_SESSION.");
        }

        // チェーンID解決: --tag が優先、なければ sessionId、どちらもなければ新規
        const isSessionMode = (tag === undefined || tag === null) && sessionId !== undefined;
        const chainId = isSessionMode
          ? await SessionManager.resolveSessionChainId(projectRoot, sessionId)
          : await SessionManager.resolveChainId(projectRoot, tag);
        const isWriteCommand = handlerDef.isWriteCommand ?? false;

        debug("cmd", `command=${request.command}, tag=${tag}, sessionId=${sessionId}, chainId=${chainId}, isSessionMode=${isSessionMode}`);

        // チェーン別のセッション・履歴マネージャを取得
        const sessionManager = getSessionManager(projectRoot, chainId);
        const historyTracker = getHistoryTracker(projectRoot, chainId);

        // 1. タグ検証と巻き戻し（sessionId モードの場合はスキップ）
        let warnings: string[];
        let currentSeq: number;
        let rejected: boolean;
        if (isSessionMode) {
          // sessionId モード: rewind 検知なし、常に最新状態で続行
          await sessionManager.ensureInit();
          currentSeq = sessionManager.getCurrentSeq();
          warnings = [];
          rejected = false;
        } else {
          const result = await sessionManager.validateAndRewind(
            request.tag,
            historyTracker,
            lspManager,
            isWriteCommand
          );
          warnings = result.warnings;
          currentSeq = result.currentSeq;
          rejected = result.rejected;
        }

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
                  // --reason がある場合は警告を無視して静かに続行（テスト環境を想定）
                  // warnings.push(`conflict warning: ${conflictCheck.message}`);
                }
              }
            } catch (err) {
              // エラーは無視して続行
              console.error(`[Phase 16] conflict check failed for ${filePath}:`, err);
            }
          }
        }

        // 4. LSP クライアントの初期化（必要なコマンドのみ）
        let lspClient: import("../lsp/client").LspClient | null = null;
        if (LSP_COMMANDS.has(request.command) && projectRoot && primaryFile) {
          lspClient = await lspManager.getClient(primaryFile, projectRoot);
        }

        // 5. 実ハンドラを呼び出し
        const requestContext: DaemonContext = { ...baseContext, lspClient };
        const endTimer = debugTime("cmd", request.command);
        const response = await handlerDef.handler(request, requestContext);
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

        // 成功時: タグ生成 or セッション進行
        if (response.ok) {
          // 初回タグかどうか（currentSeqが0の状態で最初のタグを発行する場合）
          const isFirstTag = currentSeq === 0;

          let newTag: string | undefined;
          if (isSessionMode) {
            // sessionId モード: rewind 検知なし、タグは通常通り生成して backward compat を保つ
            if (currentSeq === 0) {
              newTag = await sessionManager.currentTag();
            } else {
              const latestChangesetId = isWriteCommand ? await historyTracker.getLatestChangesetId() : null;
              newTag = await sessionManager.advance(latestChangesetId);
            }
          } else if (currentSeq === 0 && request.tag === undefined) {
            // 初回コマンド（タグなし）: currentTag() で初期タグを生成
            newTag = await sessionManager.currentTag();
          } else {
            // 2回目以降（タグ継続）: 全コマンドで advance() を呼び出す
            const latestChangesetId = isWriteCommand ? await historyTracker.getLatestChangesetId() : null;
            newTag = await sessionManager.advance(latestChangesetId);
          }

          // コンテキストと影響伝搬を追加
          let contextAndImpact = "";

          // ## context セクション（全コマンドに追加、ただしコマンド自身が既に追加している場合はスキップ）
          if (primaryFile && typeof response.data === "string" && !response.data.includes("## context")) {
            try {
              const content = bufferManager.getContent(primaryFile);
              const ctx = analyzeFileContext(primaryFile, content);
              if (ctx) {
                contextAndImpact += formatContextSection(ctx);
              }
            } catch (err) {
              // コンテキスト生成エラーは無視
            }
          }

          // ## impact セクション（書き込みコマンドのみ）
          if (isWriteCommand && response.changes && response.changes.length > 0 && typeof response.data === "string") {
            try {
              // 複数ファイル変更の場合は簡易表示
              if (response.changes.length > 1) {
                contextAndImpact += "\n## impact\n";
                contextAndImpact += `files modified: ${response.changes.length}\n`;
                for (const change of response.changes) {
                  const relativePath = change.filePath.replace(projectRoot + "/", "");
                  contextAndImpact += `  - ${relativePath}\n`;
                }
              } else {
                // 単一ファイル変更の場合は詳細解析を試行
                const change = response.changes[0];
                const content = bufferManager.getContent(change.filePath);
                const changedLines: number[] = [];
                for (let i = change.startLine; i <= change.newEndLine; i++) {
                  changedLines.push(i);
                }

                const diagnosticRegistry = getDiagnosticRegistry(projectRoot);
                const impactResult = await analyzeImpact(
                  lspManager,
                  diagnosticRegistry,
                  change.filePath,
                  changedLines,
                  content,
                  projectRoot
                );

                if (impactResult) {
                  contextAndImpact += formatImpactSection(
                    impactResult.refs,
                    impactResult.symbolName,
                    impactResult.totalCount
                  );
                }
              }
            } catch (err) {
              // 影響生成エラーは無視
            }
          }

          // ## conventions セクション（初回タグの場合のみ、全コマンド）
          if (isFirstTag && projectRoot) {
            try {
              const conv = analyzeConventions(projectRoot);
              if (conv) {
                contextAndImpact += formatConventionsSection(conv);
              }
            } catch {
              // 規約読み取りエラーは無視
            }
          }

          // 通知メッセージを data の先頭に追加
          let finalData = response.data;
          if (notificationMessages.length > 0 && typeof finalData === "string") {
            finalData = notificationMessages.join("\n") + finalData;
          }

          // コンテキストと影響を末尾に追加
          if (contextAndImpact && typeof finalData === "string") {
            finalData = finalData + contextAndImpact;
          }

          // 非推奨警告とvalidateAndRewindからの警告をマージ
          const allWarnings = [...deprecationWarnings, ...warnings];

          // タグ履歴を取得（チェーン可視化用）
          const tagHistory = await sessionManager.getTagHistory();

          return {
            ...response,
            data: finalData,
            tag: newTag,
            isFirstTag,
            tagHistory,
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
      const noSessionContext: DaemonContext = { ...baseContext, lspClient: null };
      const endTimer = debugTime("cmd", request.command);
      const result = await handlerDef.handler(request, noSessionContext);
      endTimer();
      return result;
    });
  }
}

// --- 起動 ---

/**
 * ソケットファイルが使用中（デーモンが稼働中）かを確認する。
 */
function isSocketInUse(socketPath: string): boolean {
  try {
    const { Socket } = require("node:net");
    const socket = new Socket();
    let inUse = false;

    return new Promise<boolean>((resolve) => {
      socket.once("connect", () => {
        inUse = true;
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        resolve(false);
      });
      socket.connect(socketPath);
      // タイムアウト
      setTimeout(() => {
        socket.destroy();
        resolve(inUse);
      }, 100);
    }) as unknown as boolean; // 同期的に使うためワークアラウンド
  } catch {
    return false;
  }
}

/**
 * 古いバージョンのソケット/PIDファイルをクリーンアップする。
 * RADIUS_RELEASE_HASH が設定されている場合、現在のハッシュ以外の
 * 使われていないdaemon-*.sock / daemon-*.pid ファイルを削除する。
 * 稼働中のデーモンのファイルは削除しない。
 */
function cleanupStaleVersionFiles(): void {
  const hash = process.env.RADIUS_RELEASE_HASH;
  if (!hash) return; // 開発モードではクリーンアップしない

  const radiusHome = getRadiusHome();
  if (!existsSync(radiusHome)) return;

  const currentSocketName = `daemon-${hash}.sock`;
  const currentPidName = `daemon-${hash}.pid`;

  try {
    const files = readdirSync(radiusHome);
    for (const file of files) {
      // daemon-*.sock または daemon-*.pid パターンにマッチするか確認
      const isVersionedSocket = file.startsWith("daemon-") && file.endsWith(".sock");
      const isVersionedPid = file.startsWith("daemon-") && file.endsWith(".pid");

      if (isVersionedSocket && file !== currentSocketName) {
        const socketPath = resolve(radiusHome, file);
        // PIDファイルの存在とプロセス生存を確認
        const pidFile = file.replace(".sock", ".pid");
        const pidPath = resolve(radiusHome, pidFile);
        let isStale = true;

        if (existsSync(pidPath)) {
          try {
            const pid = parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
            if (pid > 0) {
              // プロセスが生存しているか確認
              try {
                process.kill(pid, 0);
                isStale = false; // プロセスが生存している
              } catch {
                // プロセスが存在しない = stale
              }
            }
          } catch {
            // PID読み取り失敗 = stale
          }
        }

        if (isStale) {
          try {
            unlinkSync(socketPath);
          } catch {
            // 削除失敗は無視
          }
        }
      }

      if (isVersionedPid && file !== currentPidName) {
        const pidPath = resolve(radiusHome, file);
        let isStale = true;

        try {
          const pid = parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
          if (pid > 0) {
            try {
              process.kill(pid, 0);
              isStale = false; // プロセスが生存している
            } catch {
              // プロセスが存在しない = stale
            }
          }
        } catch {
          // PID読み取り失敗 = stale
        }

        if (isStale) {
          try {
            unlinkSync(pidPath);
          } catch {
            // 削除失敗は無視
          }
        }
      }
    }
  } catch {
    // ディレクトリ読み取り失敗は無視
  }
}

async function startDaemon(): Promise<void> {
  // 古いバージョンのソケット/PIDファイルをクリーンアップ
  cleanupStaleVersionFiles();

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
