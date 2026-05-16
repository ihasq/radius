import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sendRequest } from "../ipc/client";
import { getSocketPath, getPidPath } from "../shared/paths";
import { findCommand, generateUsage, buildRequestWithTag } from "./registry";
import type { IpcRequest } from "../shared/types";
import { readStdin, isStdinAvailable } from "../shared/stdin";

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

  // 既に別のCLIがspawn中の可能性がある。短いリトライで待つ。
  const daemonScript = resolve(import.meta.dir, "../daemon/main.ts");
  const child = spawn("bun", ["run", daemonScript], {
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const commandName = args[0];

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
    console.error(`error: ${response.error}`);
    process.exit(1);
  }

  // A: 警告出力
  if (response.warnings && response.warnings.length > 0) {
    for (const warning of response.warnings) {
      console.error(warning);
    }
  }

  // A: データ出力
  if (response.data !== undefined) {
    if (typeof response.data === "string") {
      console.log(response.data);
    } else {
      console.log(JSON.stringify(response.data, null, 2));
    }
  }

  // A: タグ出力
  if (response.tag) {
    console.log(`\n[tag: ${response.tag}]`);
  }
}

main().catch((err) => {
  console.error(`fatal: ${err.message}`);
  process.exit(1);
});
