/**
 * テスト用デーモンヘルパー
 *
 * 並列化サポート: 各テストファイルは beforeAll で RADIUS_HOME を設定してから
 * startDaemon() を呼び出す。RADIUS_HOME が設定されていない場合はデフォルト
 * (~/.radius) を使用する。
 */

import { spawn } from "bun";
import { sendRequest } from "../../src/ipc/client";
import { getSocketPath, getPidPath } from "../../src/shared/paths";
import { existsSync, rmSync, readFileSync } from "node:fs";

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
 * RADIUS_HOME環境変数を子プロセスに引き継ぐ。
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

  // デーモンを起動（RADIUS_HOMEを引き継ぐ）
  spawn(["bun", "run", "src/daemon/main.ts"], {
    cwd: process.cwd(),
    stdout: "ignore",
    stderr: "ignore",
    env: {
      ...process.env,
      RADIUS_HOME: process.env.RADIUS_HOME || "",
    },
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
 * PIDファイルからPIDを読み取ってプロセスを終了させる。
 */
export async function stopDaemon(): Promise<void> {
  try {
    await sendRequest({ command: "shutdown", args: {} }, 1000);
    await Bun.sleep(500);
  } catch {
    // 既に停止している可能性がある
  }

  // PIDファイルからPIDを読み取って強制終了
  const pidPath = getPidPath();
  if (existsSync(pidPath)) {
    try {
      const pid = parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
      if (pid > 0) {
        try {
          process.kill(pid, "SIGTERM");
          await Bun.sleep(200);
        } catch {
          // 既に終了している可能性がある
        }
      }
    } catch {
      // PIDファイルの読み取り失敗
    }
  }

  // ソケットとPIDファイルをクリーンアップ
  const socketPath = getSocketPath();
  if (existsSync(socketPath)) rmSync(socketPath);
  if (existsSync(pidPath)) rmSync(pidPath);
}
