/**
 * Ed25519 cryptographic operations for auto-update signature verification.
 */

import { createPublicKey, createPrivateKey, sign, verify } from "node:crypto";

/**
 * Verify an Ed25519 signature.
 *
 * @param data - The data that was signed
 * @param signature - The signature to verify
 * @param publicKeyJwk - The public key in JWK format
 * @returns true if valid, false otherwise
 */
export async function verifySignature(
  data: Buffer,
  signature: Buffer,
  publicKeyJwk: JsonWebKey
): Promise<boolean> {
  try {
    const publicKey = createPublicKey({ key: publicKeyJwk, format: "jwk" });
    return verify(null, data, publicKey, signature);
  } catch {
    // Return false for invalid keys, truncated signatures, or any other errors
    return false;
  }
}

/**
 * Create an Ed25519 signature.
 *
 * @param data - The data to sign
 * @param privateKeyJwk - The private key in JWK format
 * @returns The signature
 */
export async function createSignature(
  data: Buffer,
  privateKeyJwk: JsonWebKey
): Promise<Buffer> {
  const privateKey = createPrivateKey({ key: privateKeyJwk, format: "jwk" });
  return sign(null, data, privateKey);
}
