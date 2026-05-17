/**
 * Auto-update test fixture generator.
 *
 * Generates:
 * - Ed25519 key pair (pub.json, priv.json)
 * - Fake binary (gzip compressed)
 * - Signature for fake binary
 * - Tampered binary for negative tests
 * - latest.json with version info
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const FIXTURE_DIR = import.meta.dir;

async function generateFixtures(): Promise<void> {
  console.log("Generating auto-update test fixtures...");

  // 1. Generate Ed25519 key pair
  const keyPair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  writeFileSync(
    join(FIXTURE_DIR, "pub.json"),
    JSON.stringify(publicKeyJwk, null, 2)
  );
  writeFileSync(
    join(FIXTURE_DIR, "priv.json"),
    JSON.stringify(privateKeyJwk, null, 2)
  );
  console.log("  - Generated key pair (pub.json, priv.json)");

  // 2. Create dummy binary
  const fakeBinaryContent = Buffer.from("#!/bin/sh\necho pong\n", "utf-8");

  // 3. Gzip compress
  const gzipData = gzipSync(fakeBinaryContent);
  writeFileSync(join(FIXTURE_DIR, "fake-core.gz"), gzipData);
  console.log("  - Generated fake-core.gz");

  // 4. Calculate SHA256
  const sha256 = createHash("sha256").update(gzipData).digest("hex");
  console.log(`  - SHA256: ${sha256}`);

  // 5. Sign the gzip data
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    keyPair.privateKey,
    gzipData
  );
  writeFileSync(join(FIXTURE_DIR, "fake-core.gz.sig"), Buffer.from(signature));
  console.log("  - Generated fake-core.gz.sig");

  // 6. Create tampered version (change 1 byte)
  const tamperedContent = Buffer.from(fakeBinaryContent);
  tamperedContent[0] = tamperedContent[0] ^ 0xff; // Flip bits of first byte
  const tamperedGzip = gzipSync(tamperedContent);
  writeFileSync(join(FIXTURE_DIR, "fake-core-tampered.gz"), tamperedGzip);
  console.log("  - Generated fake-core-tampered.gz");

  // 7. Generate latest.json
  const platform = getPlatformKey();
  const hash = sha256.substring(0, 12);

  const latestJson = {
    version: "0.99.0",
    hash,
    timestamp: new Date().toISOString(),
    assets: {
      [platform]: {
        url: `${platform}.gz`,
        sha256,
      },
    },
  };

  writeFileSync(
    join(FIXTURE_DIR, "latest.json"),
    JSON.stringify(latestJson, null, 2)
  );
  console.log("  - Generated latest.json");

  console.log("\nFixture generation complete.");
}

function getPlatformKey(): string {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "linux") {
    return arch === "arm64" ? "linux-arm64" : "linux-x64";
  }
  if (platform === "darwin") {
    return arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  }
  if (platform === "win32") {
    return "win-x64";
  }
  return "linux-x64";
}

// Run if executed directly
generateFixtures().catch((err) => {
  console.error("Fixture generation failed:", err);
  process.exit(1);
});
