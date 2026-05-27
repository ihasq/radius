/**
 * Prepare signed release assets for GitHub Releases.
 *
 * Reads platform archives from CI artifacts, produces gzip + Ed25519 signature
 * per platform, latest.json, and copies pub.json.
 *
 * Usage:
 *   bun run scripts/prepare-release-assets.ts \
 *     --artifacts-dir artifacts \
 *     --output-dir release-assets \
 *     --version v0.1.0+20260527134508
 *
 * Requires RADIUS_SIGNING_KEY (private JWK JSON) in the environment.
 */

import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createSignature } from "../src/shared/crypto.ts";

interface PlatformDef {
  key: string;
  binary: string;
  archive: string;
}

const PLATFORMS: PlatformDef[] = [
  { key: "linux-x64", binary: "radiusd-linux-x64", archive: "radius-linux-x64.tar.gz" },
  { key: "linux-arm64", binary: "radiusd-linux-arm64", archive: "radius-linux-arm64.tar.gz" },
  { key: "darwin-arm64", binary: "radiusd-darwin-arm64", archive: "radius-darwin-arm64.tar.gz" },
  { key: "darwin-x64", binary: "radiusd-darwin-x64", archive: "radius-darwin-x64.tar.gz" },
  { key: "win-x64", binary: "radiusd-win-x64.exe", archive: "radius-win-x64.zip" },
];

function parseArgs(): { artifactsDir: string; outputDir: string; version: string } {
  const args = process.argv.slice(2);
  let artifactsDir = "";
  let outputDir = "";
  let version = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--artifacts-dir") artifactsDir = args[++i] ?? "";
    else if (args[i] === "--output-dir") outputDir = args[++i] ?? "";
    else if (args[i] === "--version") version = args[++i] ?? "";
  }

  if (!artifactsDir || !outputDir || !version) {
    console.error(
      "usage: prepare-release-assets.ts --artifacts-dir DIR --output-dir DIR --version TAG"
    );
    process.exit(1);
  }

  return { artifactsDir, outputDir, version };
}

function extractBinary(artifactsDir: string, platform: PlatformDef): Buffer {
  const archivePath = join(artifactsDir, platform.archive);
  if (!existsSync(archivePath)) {
    throw new Error(`missing artifact: ${platform.archive}`);
  }

  if (platform.archive.endsWith(".tar.gz")) {
    const proc = Bun.spawnSync(["tar", "xzf", archivePath, "-O", platform.binary]);
    if (proc.exitCode !== 0) {
      throw new Error(`failed to extract ${platform.binary} from ${platform.archive}`);
    }
    return Buffer.from(proc.stdout);
  }

  const zip = new AdmZip(archivePath);
  const entry = zip.getEntry(platform.binary);
  if (!entry) {
    throw new Error(`missing ${platform.binary} in ${platform.archive}`);
  }
  return entry.getData();
}

async function main(): Promise<void> {
  const { artifactsDir, outputDir, version } = parseArgs();

  const signingKeyJson = process.env.RADIUS_SIGNING_KEY;
  if (!signingKeyJson) {
    throw new Error("RADIUS_SIGNING_KEY environment variable is required");
  }
  const privateKeyJwk = JSON.parse(signingKeyJson) as JsonWebKey;

  const pubPath = join(import.meta.dir, "release", "pub.json");
  if (!existsSync(pubPath)) {
    throw new Error(`missing public key: ${pubPath}`);
  }

  mkdirSync(outputDir, { recursive: true });

  const assets: Record<string, { url: string; sha256: string }> = {};
  let releaseHash = "";

  for (const platform of PLATFORMS) {
    const binary = extractBinary(artifactsDir, platform);
    const gz = gzipSync(binary);
    const sha256 = createHash("sha256").update(gz).digest("hex");
    const signature = await createSignature(gz, privateKeyJwk);

    const gzName = `${platform.key}.gz`;
    writeFileSync(join(outputDir, gzName), gz);
    writeFileSync(join(outputDir, `${gzName}.sig`), signature);

    assets[platform.key] = { url: gzName, sha256 };

    if (platform.key === "linux-x64") {
      releaseHash = sha256.slice(0, 12);
    }

    console.log(`  prepared ${gzName} (${sha256.slice(0, 12)}…)`);
  }

  if (!releaseHash) {
    throw new Error("failed to derive release hash");
  }

  const latestJson = {
    version,
    hash: releaseHash,
    timestamp: new Date().toISOString(),
    assets,
  };

  writeFileSync(join(outputDir, "latest.json"), JSON.stringify(latestJson, null, 2));
  copyFileSync(pubPath, join(outputDir, "pub.json"));

  console.log(`release hash: ${releaseHash}`);
  console.log(`wrote latest.json and pub.json to ${outputDir}`);
}

main().catch((err) => {
  console.error("prepare-release-assets failed:", err);
  process.exit(1);
});
