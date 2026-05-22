import nacl from 'tweetnacl';
import type { Operation } from './types';

function operationToBytes(op: Operation): Uint8Array {
  const payload = JSON.stringify({
    id: op.id,
    participantId: op.participantId,
    regionId: op.regionId,
    type: op.type,
    content: op.content,
    reason: op.reason,
    timestamp: op.timestamp,
  });
  return new TextEncoder().encode(payload);
}

export function signOperation(op: Operation, secretKey: Uint8Array): string {
  const message = operationToBytes(op);
  const sig = nacl.sign.detached(message, secretKey);
  return Buffer.from(sig).toString('base64');
}

export function verifyOperation(op: Operation, publicKey: string): boolean {
  try {
    const message = operationToBytes(op);
    const sig = Buffer.from(op.signature, 'base64');
    const pk = Buffer.from(publicKey, 'base64');
    return nacl.sign.detached.verify(message, sig, pk);
  } catch {
    return false;
  }
}

export function generateKeyPair(): { publicKey: string; secretKey: Uint8Array } {
  const kp = nacl.sign.keyPair();
  return {
    publicKey: Buffer.from(kp.publicKey).toString('base64'),
    secretKey: kp.secretKey,
  };
}
