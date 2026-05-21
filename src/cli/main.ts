/**
 * Radius CLI
 *
 * Hotfix 2026-05-17:
 * - Added --help / --version flags
 * - Fixed daemon binary resolution for production deployments
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { sendRequest } from "../ipc/client";
import { getSocketPath, getPidPath } from "../shared/paths";
import { findCommand, generateUsage, buildRequestWithTag } from "./registry";
import type { IpcRequest } from "../shared/types";
import { readStdin, isStdinAvailable } from "../shared/stdin";
import pkg from "../../package.json";
import { muted, stripAnsi, shouldStripColors } from "../shared/colors";
import { getTip } from "./tips";

/**
 * PIDファイルに記録されたプロセスが生存しているか確認する。
 */
function isDaemonProcessAlive(): boolean {
  const pidPath = getPidPath();
  if (!existsSync(pidPath)) return false;
  try {
    const pid = parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
    // シグナル0はプロセスの存在確認に使用する。
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
 * 排他制御: PIDファイルが存在し、かつプロセスが生存している場合はspawnしない。
 */
async function ensureDaemon(): Promise<boolean> {
  if (await isDaemonRunning()) return true;

  // radiusd の解決優先順:
  // 1. radius バイナリと同一ディレクトリの radiusd
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
    // 2. PATH 上の radiusd を試す（which相当の判定）
    try {
      const { execSync } = require("node:child_process");
      execSync(`${process.platform === "win32" ? "where" : "which"} ${radiusdName}`, { stdio: "ignore" });
      daemonCmd = radiusdName;
    } catch {
      // 3. 開発モード
      daemonCmd = "bun";
      daemonArgs = ["run", resolve(import.meta.dir, "../daemon/main.ts")];
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const commandName = args[0];

  // A: --help / --version フラグ
  if (commandName === "--help" || commandName === "-h") {
    console.log(generateUsage());
    console.log("  daemon stop                             デーモンの停止");
    process.exit(0);
  }

  if (commandName === "--version" || commandName === "-v") {
    console.log(pkg.version);
    process.exit(0);
  }

  // A: usage 表示
  if (!commandName) {
    console.log(generateUsage());
    console.log("  daemon stop                             デーモンの停止");
    process.exit(0);
  }

  // A: daemon stop は特殊コマンド（デーモン未起動時にも動作）
  if (commandName === "daemon" && args[1] === "stop") {
    const resp = await sendRequest({ command: "shutdown", args: {} });
    if (resp === null) {
      console.error("error: daemon is not running");
      process.exit(1);
    }
    console.log("daemon stopped");
    process.exit(0);
  }

  // A: コマンド検索
  const cmdDef = findCommand(commandName);
  if (!cmdDef) {
    console.error(`error: unknown command: ${commandName}`);
    console.log(generateUsage());
    process.exit(1);
  }

  // A: コマンド固有の --help
  if (args.slice(1).includes("--help") || args.slice(1).includes("-h")) {
    console.log(cmdDef.help);
    process.exit(0);
  }

  // A: デーモン起動確認
  const running = await ensureDaemon();
  if (!running) {
    console.error("error: failed to start daemon");
    process.exit(1);
  }

  // A: --stdin オプションの処理
  let stdinContent: string | undefined;
  const hasStdinFlag = args.slice(1).includes("--stdin");
  if (hasStdinFlag) {
    if (!isStdinAvailable()) {
      console.error("error: --stdin specified but no input provided");
      process.exit(1);
    }
    stdinContent = await readStdin();
  }

  // A: リクエスト構築
  let request: IpcRequest;
  try {
    request = buildRequestWithTag(cmdDef, args.slice(1), process.cwd(), stdinContent);
  } catch (usageMessage) {
    console.error(usageMessage);
    process.exit(1);
  }

  // A: リクエスト送信
  const response = await sendRequest(request);
  if (response === null) {
    console.error("error: lost connection to daemon");
    process.exit(1);
  }

  // A: エラーハンドリング
  if (!response.ok) {
    let errorMsg: string;
    const err = response.error;
    if (typeof err === "string") {
      errorMsg = err;
    } else if (err && typeof err === "object" && "message" in err) {
      errorMsg = String((err as { message: unknown }).message);
    } else {
      errorMsg = String(err || "unknown error");
    }
    console.error(`error: ${errorMsg}`);
    // tips 追加（--help 指定時は除外）
    if (!args.includes("--help") && !args.includes("-h")) {
      const tip = getTip(commandName, errorMsg);
      if (tip) {
        console.error(tip);
      }
    }
    process.exit(1);
  }

  // A: 警告出力
  if (response.warnings && response.warnings.length > 0) {
    // CLI側で着色（デーモン側では着色されていない生テキスト）
    const { warning: colorWarning } = await import("../shared/colors");
    for (const warningText of response.warnings) {
      console.log(colorWarning(warningText));
    }
  }

  // A: データ出力
  if (response.data !== undefined) {
    if (typeof response.data === "string") {
      // NO_COLOR が設定されている場合はANSIコードを除去
      const output = shouldStripColors() ? stripAnsi(response.data) : response.data;
      console.log(output);
    } else {
      console.log(JSON.stringify(response.data, null, 2));
    }
  }

  // A: タグ出力
  if (response.tag) {
    console.log(muted("\n---"));
    console.log(`radius-tag: ${response.tag}`);
    console.log(muted(`[include --tag ${response.tag} to maintain edit history]`));
    console.log("");
    console.log(muted("> **`--tag` is mandatory.** Every subsequent command in this editing session MUST include `--tag " + response.tag + "`."));
    console.log(muted("> Omitting `--tag` will start a new, disconnected chain and cause conflict errors."));
    console.log(muted("> To intentionally start a new chain, pass `--reason \"your reason\"` instead."));

    // 初回タグの場合は追加のノートを表示
    if (response.isFirstTag) {
      console.log("");
      console.log(muted("(This is your first command. Radius will track your edits and enable undo.)"));
    }
  }
}

main().catch((err) => {
  console.error(`fatal: ${err.message}`);
  process.exit(1);
});
