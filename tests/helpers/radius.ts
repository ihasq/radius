/**
 * radius CLIラッパー
 */

import { spawn } from "bun";

export interface RadiusResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * radius コマンドを実行する。
 * @param args コマンド引数の配列
 * @param options 追加オプション（stdin入力、タイムアウト等）
 */
// 書き込みコマンド一覧（conflict検出をバイパスするため）
const WRITE_COMMANDS = ["str-replace", "insert", "create", "replace", "replace-all", "fix", "format", "modify-var", "rename-file"];

export async function radius(
  args: string[],
  options?: {
    stdin?: string;
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
    /** conflict検出をテストする場合trueを設定。自動--reason付与を無効化 */
    skipAutoReason?: boolean;
  }
): Promise<RadiusResult> {
  const timeout = options?.timeout ?? 30000;
  const projectRoot = process.cwd().includes("/tests")
    ? process.cwd().split("/tests")[0]
    : process.cwd();
  const cwd = options?.cwd ?? projectRoot;

  // テスト時は書き込みコマンドに --reason "test" を自動付与（conflict検出バイパス）
  // skipAutoReason: true の場合は無効化（conflict検出テスト用）
  let finalArgs = [...args];
  const command = args[0];
  if (!options?.skipAutoReason && WRITE_COMMANDS.includes(command) && !args.includes("--reason")) {
    finalArgs.push("--reason", "test");
    // DEBUG: confirm --reason is added
    if (process.env.DEBUG_RADIUS_HELPER) {
      console.log(`[radius helper] Added --reason to ${command}`);
    }
  }

  // 環境変数: デフォルトでNO_COLOR=1、RADIUS_HOMEを引き継ぐ
  const env = {
    ...process.env,
    NO_COLOR: "1",
    RADIUS_HOME: process.env.RADIUS_HOME || "",
    RADIUS_AUTO_SESSION: "0",
    ...options?.env,
  };
  if (options?.env?.FORCE_COLOR) {
    delete env.NO_COLOR;
  }

  // DEBUG: log final args
  if (process.env.DEBUG_RADIUS_HELPER) {
    console.log(`[radius helper] finalArgs:`, JSON.stringify(finalArgs));
  }

  // Use compiled binary instead of bun run to avoid module cache issues
  const radiusBin = `${projectRoot}/dist/radius`;
  const proc = spawn([radiusBin, ...finalArgs], {
    cwd,
    env,
    stdin: options?.stdin ? "pipe" : "inherit",
    stdout: "pipe",
    stderr: "pipe",
  });

  // stdin入力がある場合
  if (options?.stdin && proc.stdin) {
    proc.stdin.write(options.stdin);
    proc.stdin.end();
  }

  // タイムアウト処理
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Command timeout")), timeout);
  });

  try {
    const result = await Promise.race([proc.exited, timeoutPromise]);

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    return {
      stdout,
      stderr,
      exitCode: proc.exitCode ?? 1,
    };
  } catch (error) {
    proc.kill();
    throw error;
  }
}

/**
 * 出力からradius-tagを抽出する。
 */
export function extractTag(stdout: string): string {
  const cleaned = stdout.replace(/\u001b\[[0-9;]*m/g, "");
  const match = cleaned.match(/radius-tag:\s*(\S+)/);
  if (!match) throw new Error("No radius-tag found in output");
  return match[1];
}
