import { resolve } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

/** Radiusホームディレクトリのパスを返す。ディレクトリは作成しない。 */
export function getRadiusHome(): string {
  return process.env.RADIUS_HOME || resolve(homedir(), ".radius");
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
