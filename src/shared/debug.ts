const DEBUG_MODULES = new Set(
  (process.env.RADIUS_DEBUG || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
);

const DEBUG_ALL = DEBUG_MODULES.has("1") || DEBUG_MODULES.has("*");

// デーモンモードかどうかを判定（radiusd として実行されているか）
const IS_DAEMON = process.argv[1]?.includes("radiusd") || process.argv[1]?.includes("daemon/main");

// デーモンモードの場合、ログファイルを開く
let daemonLogFd: number | null = null;
if (IS_DAEMON && (DEBUG_ALL || DEBUG_MODULES.size > 0)) {
  try {
    const { openSync } = require("node:fs");
    const { join } = require("node:path");
    const { getRadiusHome } = require("./paths");
    const logPath = join(getRadiusHome(), "daemon-debug.log");
    daemonLogFd = openSync(logPath, "a");
  } catch {
    // ログファイルを開けない場合は無視
  }
}

export function isDebug(module: string): boolean {
  return DEBUG_ALL || DEBUG_MODULES.has(module);
}

function writeLog(line: string): void {
  console.error(line);
  if (daemonLogFd !== null) {
    try {
      const { writeSync } = require("node:fs");
      writeSync(daemonLogFd, line + "\n");
    } catch {
      // 書き込みエラーは無視
    }
  }
}

export function debug(module: string, msg: string, data?: unknown): void {
  if (!isDebug(module)) return;
  const ts = new Date().toISOString();
  const line = data !== undefined
    ? `[${ts}] [${module}] ${msg} ${JSON.stringify(data)}`
    : `[${ts}] [${module}] ${msg}`;
  writeLog(line);
}

export function debugError(module: string, msg: string, err: unknown): void {
  if (!isDebug(module)) return;
  const ts = new Date().toISOString();
  const stack = err instanceof Error ? err.stack : String(err);
  writeLog(`[${ts}] [${module}] ${msg}\n${stack}`);
}

export function debugTime(module: string, label: string): () => void {
  if (!isDebug(module)) return () => {};
  const start = performance.now();
  return () => {
    const ms = (performance.now() - start).toFixed(1);
    debug(module, `${label}: ${ms}ms`);
  };
}
