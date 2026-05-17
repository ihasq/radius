/**
 * Auto-update version management utilities.
 */

import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  writeFileSync,
  unlinkSync,
  chmodSync,
  mkdirSync,
  existsSync,
  symlinkSync,
  lstatSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { arch, platform } from "node:os";

/**
 * Release information from latest.json.
 */
export interface ReleaseInfo {
  version: string;
  hash: string;
  timestamp: string;
  assets: Record<string, { url: string; sha256: string }>;
}

/**
 * Parse latest.json content.
 *
 * @param json - The JSON string to parse
 * @returns ReleaseInfo or null if invalid
 */
export function parseLatestJson(json: string): ReleaseInfo | null {
  try {
    const obj = JSON.parse(json);
    if (!obj.version || !obj.hash || !obj.timestamp || !obj.assets) return null;
    if (typeof obj.assets !== "object") return null;
    return obj as ReleaseInfo;
  } catch {
    return null;
  }
}

/**
 * Check if an update is needed.
 *
 * @param currentHash - The current installed hash, or null if not installed
 * @param latest - The latest release info
 * @returns true if update is needed
 */
export function needsUpdate(
  currentHash: string | null,
  latest: ReleaseInfo
): boolean {
  if (currentHash === null) return true;
  return currentHash !== latest.hash;
}

/**
 * Get the platform key for the current system.
 *
 * @returns Platform key like "linux-x64", "darwin-arm64", etc.
 */
export function getPlatformKey(): string {
  const os = platform();
  const cpu = arch();

  const osMap: Record<string, string> = {
    linux: "linux",
    darwin: "darwin",
    win32: "win",
  };
  const archMap: Record<string, string> = {
    x64: "x64",
    arm64: "arm64",
  };

  const osKey = osMap[os];
  const archKey = archMap[cpu];
  if (!osKey || !archKey) {
    throw new Error(`Unsupported platform: ${os}-${cpu}`);
  }
  return `${osKey}-${archKey}`;
}

/**
 * Extract a gzip file and verify its SHA256 hash.
 *
 * @param gzipData - The gzip compressed data
 * @param destPath - The destination file path
 * @param expectedSha256 - The expected SHA256 hash
 * @returns true if extraction and verification succeeded
 */
export function extractAndVerify(
  gzipData: Buffer,
  destPath: string,
  expectedSha256: string
): boolean {
  // 1. SHA256 verification (verify gzip data before extraction)
  const hash = createHash("sha256").update(gzipData).digest("hex");
  if (hash !== expectedSha256) {
    // Clean up if file was partially written
    if (existsSync(destPath)) {
      try {
        unlinkSync(destPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    return false;
  }

  // 2. Decompress gzip
  const extracted = gunzipSync(gzipData);

  // 3. Create directory
  mkdirSync(dirname(destPath), { recursive: true });

  // 4. Write file
  writeFileSync(destPath, extracted);

  // 5. Set executable permission (Unix only)
  if (process.platform !== "win32") {
    chmodSync(destPath, 0o755);
  }

  return true;
}

/**
 * Update the "current" symlink to point to a release directory.
 *
 * @param radiusHome - The RADIUS_HOME directory
 * @param releaseHash - The hash of the release to point to
 */
export function updateCurrentLink(
  radiusHome: string,
  releaseHash: string
): void {
  const binDir = resolve(radiusHome, "bin");
  const currentLink = resolve(binDir, "current");
  const targetDir = resolve(binDir, releaseHash);

  mkdirSync(binDir, { recursive: true });

  // Remove existing symlink if it exists
  if (existsSync(currentLink)) {
    try {
      const stats = lstatSync(currentLink);
      if (stats.isSymbolicLink() || stats.isFile() || stats.isDirectory()) {
        unlinkSync(currentLink);
      }
    } catch {
      // Ignore errors during removal
    }
  }

  // Create symlink - "dir" type is for Windows compatibility, ignored on Unix
  symlinkSync(targetDir, currentLink, "dir");
}
