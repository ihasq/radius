/**
 * Auto-update: Ed25519 signature verification unit tests.
 *
 * Tests for src/shared/crypto.ts
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

// Import target functions (will fail until implemented)
import { verifySignature, createSignature } from "../src/shared/crypto";

const FIXTURE_DIR = join(import.meta.dir, "fixtures/update");

// Ensure fixtures exist before tests
beforeAll(() => {
  const pubPath = join(FIXTURE_DIR, "pub.json");
  if (!existsSync(pubPath)) {
    execSync("bun run generate-fixtures.ts", { cwd: FIXTURE_DIR });
  }
});

function loadFixture(name: string): Buffer {
  return readFileSync(join(FIXTURE_DIR, name));
}

function loadJsonFixture(name: string): JsonWebKey {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf-8"));
}

describe("Ed25519 signature verification", () => {
  test("verifySignature returns true for valid signature", async () => {
    const pubKey = loadJsonFixture("pub.json");
    const privKey = loadJsonFixture("priv.json");
    const data = Buffer.from("test data for signing");

    // Create signature with private key
    const signature = await createSignature(data, privKey);

    // Verify with public key
    const result = await verifySignature(data, signature, pubKey);
    expect(result).toBe(true);
  });

  test("verifySignature returns false for tampered data", async () => {
    const pubKey = loadJsonFixture("pub.json");
    const privKey = loadJsonFixture("priv.json");
    const data = Buffer.from("original data");

    // Create signature
    const signature = await createSignature(data, privKey);

    // Tamper with data
    const tamperedData = Buffer.from("tampered data");

    // Verify should fail
    const result = await verifySignature(tamperedData, signature, pubKey);
    expect(result).toBe(false);
  });

  test("verifySignature returns false for wrong public key", async () => {
    const privKey = loadJsonFixture("priv.json");
    const data = Buffer.from("test data");

    // Create signature with fixture private key
    const signature = await createSignature(data, privKey);

    // Generate a different key pair
    const differentKeyPair = await crypto.subtle.generateKey(
      { name: "Ed25519" },
      true,
      ["sign", "verify"]
    );
    const differentPubKey = await crypto.subtle.exportKey("jwk", differentKeyPair.publicKey);

    // Verify with different public key should fail
    const result = await verifySignature(data, signature, differentPubKey);
    expect(result).toBe(false);
  });

  test("verifySignature returns false for truncated signature", async () => {
    const pubKey = loadJsonFixture("pub.json");
    const privKey = loadJsonFixture("priv.json");
    const data = Buffer.from("test data");

    // Create signature
    const signature = await createSignature(data, privKey);

    // Truncate signature (remove last 10 bytes)
    const truncatedSignature = signature.subarray(0, signature.length - 10);

    // Verify should return false (not throw)
    const result = await verifySignature(data, truncatedSignature, pubKey);
    expect(result).toBe(false);
  });

  test("createSignature produces verifiable signature", async () => {
    const pubKey = loadJsonFixture("pub.json");
    const privKey = loadJsonFixture("priv.json");
    const data = Buffer.from("roundtrip test data");

    // Create signature
    const signature = await createSignature(data, privKey);

    // Signature should be 64 bytes for Ed25519
    expect(signature.length).toBe(64);

    // Should be verifiable
    const result = await verifySignature(data, signature, pubKey);
    expect(result).toBe(true);
  });

  test("pub.json fixture contains valid Ed25519 JWK", () => {
    const pubKey = loadJsonFixture("pub.json");

    expect(pubKey.kty).toBe("OKP");
    expect(pubKey.crv).toBe("Ed25519");
    expect(pubKey.x).toBeDefined();
    expect(typeof pubKey.x).toBe("string");

    // x should be base64url encoded (32 bytes = 43 chars with padding)
    expect(pubKey.x!.length).toBeGreaterThanOrEqual(42);
  });
});
