import { resolve } from "node:path";
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
 * セッションIDを解決する（作成はしない）。
 * 優先順: RADIUS_SESSION env → ~/.radius/active-session
 */
export function resolveSessionId(): string | undefined {
  const envId = process.env.RADIUS_SESSION;
  if (envId) return envId;

  const sessionPath = getActiveSessionPath();
  if (existsSync(sessionPath)) {
    const id = readFileSync(sessionPath, "utf-8").trim();
    if (id) return id;
  }

  return undefined;
}

/**
 * セッションIDを解決し、未設定なら新規作成して永続化する。
 */
export function ensureSessionId(): string {
  const existing = resolveSessionId();
  if (existing) return existing;

  const id = randomUUID();
  const sessionPath = getActiveSessionPath();
  ensureRadiusHome();
  writeFileSync(sessionPath, id, "utf-8");
  return id;
}

/**
 * 暗黙セッション（--tag 不要）を有効にするか。
 * デフォルト有効。テストでは RADIUS_AUTO_SESSION=0 を設定する。
 */
export function shouldAutoSession(): boolean {
  return process.env.RADIUS_AUTO_SESSION !== "0";
}
