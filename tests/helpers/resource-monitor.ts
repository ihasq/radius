import { execSync } from "node:child_process";

/**
 * デーモンプロセスの RSS（MB）を取得する。
 * デーモンが存在しない場合は 0 を返す。
 */
export function getDaemonRssMb(): number {
  try {
    const pid = execSync("pgrep -f 'daemon/main' | head -1", { encoding: "utf-8" }).trim();
    if (!pid) return 0;
    const rss = execSync(`ps -o rss= -p ${pid}`, { encoding: "utf-8" }).trim();
    return Math.round(parseInt(rss, 10) / 1024);
  } catch {
    return 0;
  }
}

/**
 * tsserver プロセスの数を返す。
 */
export function getTsserverCount(): number {
  try {
    const result = execSync("pgrep -c tsserver 2>/dev/null || echo 0", { encoding: "utf-8" });
    return parseInt(result.trim(), 10);
  } catch {
    return 0;
  }
}

/**
 * typescript-language-server プロセスの数を返す。
 */
export function getTslspCount(): number {
  try {
    const result = execSync("pgrep -c 'typescript-language-server' 2>/dev/null || echo 0", { encoding: "utf-8" });
    return parseInt(result.trim(), 10);
  } catch {
    return 0;
  }
}

/**
 * コマンドの実行時間（ms）を計測する。
 */
export async function measureTime(fn: () => Promise<void>): Promise<number> {
  const start = Date.now();
  await fn();
  return Date.now() - start;
}
