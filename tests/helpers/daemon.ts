/**
 * テスト用デーモンヘルパー
 */

import { spawn } from "bun";
import { sendRequest } from "../../src/ipc/client";
import { getSocketPath, getPidPath } from "../../src/shared/paths";
import { existsSync, rmSync } from "node:fs";

let daemonProcess: ReturnType<typeof spawn> | null = null;

/**
 * デーモンが起動しているか確認する。
 */
export async function isDaemonReady(): Promise<boolean> {
  try {
    const response = await sendRequest({ command: "ping", args: {} }, 1000);
    return response !== null && response.ok;
  } catch {
    return false;
  }
}

/**
 * テスト用デーモンを起動する。
 * 既存デーモンが起動していれば停止してから再起動する。
 */
export async function startDaemon(): Promise<void> {
  // 既存デーモンを停止
  if (await isDaemonReady()) {
    await stopDaemon();
    // ソケットファイルが削除されるまで待機
    await Bun.sleep(500);
  }

  // ソケットとPIDファイルをクリーンアップ
  const socketPath = getSocketPath();
  const pidPath = getPidPath();
  if (existsSync(socketPath)) rmSync(socketPath);
  if (existsSync(pidPath)) rmSync(pidPath);

  // デーモンを起動
  daemonProcess = spawn(["bun", "run", "src/daemon/main.ts"], {
    cwd: process.cwd(),
    stdout: "ignore",
    stderr: "ignore",
  });

  // 起動完了を待機（最大5秒）
  const maxWait = 5000;
  const interval = 100;
  let waited = 0;

  while (waited < maxWait) {
    await Bun.sleep(interval);
    waited += interval;
    if (await isDaemonReady()) {
      return;
    }
  }

  throw new Error("Failed to start daemon within timeout");
}

/**
 * テスト用デーモンを停止する。
 */
export async function stopDaemon(): Promise<void> {
  try {
    await sendRequest({ command: "shutdown", args: {} }, 1000);
    await Bun.sleep(500);
  } catch {
    // 既に停止している可能性がある
  }

  // プロセスが残っていれば強制終了
  if (daemonProcess) {
    try {
      daemonProcess.kill();
    } catch {
      // 既に終了している可能性がある
    }
    daemonProcess = null;
  }

  // ソケットとPIDファイルをクリーンアップ
  const socketPath = getSocketPath();
  const pidPath = getPidPath();
  if (existsSync(socketPath)) rmSync(socketPath);
  if (existsSync(pidPath)) rmSync(pidPath);
}
