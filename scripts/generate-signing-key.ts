/**
 * Generate Ed25519 signing key pair for release asset signing.
 *
 * Usage:
 *   bun run scripts/generate-signing-key.ts
 *
 * Writes scripts/release/pub.json (commit this file).
 * Prints the private JWK — store it as the RADIUS_SIGNING_KEY GitHub secret.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(import.meta.dir, "release");
const PUB_PATH = join(OUT_DIR, "pub.json");

async function main(): Promise<void> {
  if (existsSync(PUB_PATH)) {
    console.error(`Refusing to overwrite existing ${PUB_PATH}.`);
    console.error("Delete it first if you intend to rotate signing keys.");
    process.exit(1);
  }
  const keyPair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "pub.json"), JSON.stringify(publicKeyJwk, null, 2));

  console.log("Wrote scripts/release/pub.json");
  console.log("");
  console.log("Add this private key as the RADIUS_SIGNING_KEY GitHub repository secret:");
  console.log(JSON.stringify(privateKeyJwk));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
