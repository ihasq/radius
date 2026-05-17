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
export async function radius(
  args: string[],
  options?: {
    stdin?: string;
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
  }
): Promise<RadiusResult> {
  const timeout = options?.timeout ?? 30000;
  const projectRoot = process.cwd().includes("/tests")
    ? process.cwd().split("/tests")[0]
    : process.cwd();
  const cwd = options?.cwd ?? projectRoot;

  // 環境変数: デフォルトでNO_COLOR=1、ただしFORCE_COLORが指定されている場合は削除
  const env = { ...process.env, NO_COLOR: "1", ...options?.env };
  if (options?.env?.FORCE_COLOR) {
    delete env.NO_COLOR;
  }

  const proc = spawn(["bun", "run", `${projectRoot}/src/cli/main.ts`, ...args], {
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
  const match = stdout.match(/radius-tag:\s*(\S+)/);
  if (!match) throw new Error("No radius-tag found in output");
  return match[1];
}
