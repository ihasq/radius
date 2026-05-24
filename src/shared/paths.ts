import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { BUILD_MODE } from "./build-info";

/** Radiusホームディレクトリのパスを返す。ディレクトリは作成しない。 */
export function getRadiusHome(): string {
  const envHome = process.env.RADIUS_HOME;
  if (envHome) return envHome;

  const base = BUILD_MODE === "dev" ? ".radius-dev" : ".radius";
  return resolve(homedir(), base);
}

/** Radiusホームディレクトリを作成し、パスを返す。 */
export function ensureRadiusHome(): string {
  const dir = getRadiusHome();
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** デーモンのUDSソケットパスを返す。 */
export function getSocketPath(): string {
  const hash = process.env.RADIUS_RELEASE_HASH;
  const filename = hash ? `daemon-${hash}.sock` : "daemon.sock";
  return resolve(ensureRadiusHome(), filename);
}

/** デーモンのPIDファイルパスを返す。 */
export function getPidPath(): string {
  const hash = process.env.RADIUS_RELEASE_HASH;
  const filename = hash ? `daemon-${hash}.pid` : "daemon.pid";
  return resolve(ensureRadiusHome(), filename);
}

/** プロジェクトの絶対パスからSHA-256先頭16文字のハッシュを生成する。 */
export async function projectHash(absolutePath: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(absolutePath);
  return hasher.digest("hex").slice(0, 16);
}

/** プロジェクト固有のデータディレクトリを作成し、パスを返す。 */
export async function getProjectDir(absolutePath: string): Promise<string> {
  const hash = await projectHash(absolutePath);
  const dir = resolve(ensureRadiusHome(), hash);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** アクティブセッションIDを永続化するファイルのパス。 */
export function getActiveSessionPath(): string {
  return resolve(ensureRadiusHome(), "active-session");
}

/**
 * セッションIDを解決する。
 * 優先順: RADIUS_SESSION env var → ~/.radius/active-session ファイル → 自動生成
 * 生成された場合、env var にセットしファイルにも永続化する。
 */
export function resolveSessionId(): string {
  const envId = process.env.RADIUS_SESSION;
  if (envId) return envId;

  const sessionFile = getActiveSessionPath();
  if (existsSync(sessionFile)) {
    try {
      const fileId = readFileSync(sessionFile, "utf-8").trim();
      if (fileId) {
        process.env.RADIUS_SESSION = fileId;
        return fileId;
      }
    } catch {
      // ignore
    }
  }

  const newId = randomUUID();
  process.env.RADIUS_SESSION = newId;
  try {
    mkdirSync(dirname(sessionFile), { recursive: true });
    writeFileSync(sessionFile, newId + "\n");
  } catch {
    // ignore
  }
  return newId;
}
