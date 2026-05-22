import { describe, test, expect } from 'bun:test';
import type { Participant, Operation } from '../../rad/src/types';
import { ParticipantQueue } from '../../rad/src/participant-queue';
import { CodeRegionMap } from '../../rad/src/code-region';
import { OperationLog } from '../../rad/src/operation-log';
import { signOperation, verifyOperation, generateKeyPair } from '../../rad/src/crypto';
import { RuleEngine } from '../../rad/src/rule-engine';

describe('Group A: 型定義', () => {
  test('T01: Participant 型に id, publicKey, joinedAt フィールドがある', () => {
    const p: Participant = {
      id: 'alice',
      publicKey: 'pk_alice',
      joinedAt: Date.now(),
    };
    expect(p.id).toBe('alice');
    expect(p.publicKey).toBe('pk_alice');
    expect(typeof p.joinedAt).toBe('number');
  });

  test('T02: Operation 型に id, participantId, regionId, type, content, reason, signature, timestamp がある', () => {
    const op: Operation = {
      id: 'op1',
      participantId: 'alice',
      regionId: 'r1',
      type: 'write',
      content: 'console.log("hello");',
      reason: undefined,
      signature: 'sig_dummy',
      timestamp: Date.now(),
    };
    expect(op.id).toBe('op1');
    expect(op.participantId).toBe('alice');
    expect(op.regionId).toBe('r1');
    expect(op.type).toBe('write');
    expect(op.content).toBe('console.log("hello");');
    expect(op.signature).toBe('sig_dummy');
    expect(typeof op.timestamp).toBe('number');
  });
});

describe('Group B: 参加列', () => {
  test('T03: ParticipantQueue.join() で参加者を追加できる', () => {
    const queue = new ParticipantQueue();
    const alice: Participant = { id: 'alice', publicKey: 'pk_a', joinedAt: 1000 };
    queue.join(alice);
    expect(queue.getAll()).toHaveLength(1);
    expect(queue.getAll()[0].id).toBe('alice');
  });

  test('T04: ParticipantQueue.getOrder() で参加順を取得できる（先着順）', () => {
    const queue = new ParticipantQueue();
    const alice: Participant = { id: 'alice', publicKey: 'pk_a', joinedAt: 1000 };
    const bob: Participant = { id: 'bob', publicKey: 'pk_b', joinedAt: 2000 };
    const claude: Participant = { id: 'claude', publicKey: 'pk_c', joinedAt: 3000 };
    queue.join(alice);
    queue.join(bob);
    queue.join(claude);
    expect(queue.getOrder('alice')).toBe(0);
    expect(queue.getOrder('bob')).toBe(1);
    expect(queue.getOrder('claude')).toBe(2);
  });

  test('T05: ParticipantQueue.isBefore(a, b) が正しく判定する', () => {
    const queue = new ParticipantQueue();
    const alice: Participant = { id: 'alice', publicKey: 'pk_a', joinedAt: 1000 };
    const bob: Participant = { id: 'bob', publicKey: 'pk_b', joinedAt: 2000 };
    queue.join(alice);
    queue.join(bob);
    expect(queue.isBefore('alice', 'bob')).toBe(true);
    expect(queue.isBefore('bob', 'alice')).toBe(false);
  });

  test('T06: 後の参加者による前の参加者のコード上書きが canWrite = true を返す', () => {
    const queue = new ParticipantQueue();
    const alice: Participant = { id: 'alice', publicKey: 'pk_a', joinedAt: 1000 };
    const bob: Participant = { id: 'bob', publicKey: 'pk_b', joinedAt: 2000 };
    queue.join(alice);
    queue.join(bob);
    // Bob (後) が Alice (前) のコードを上書き
    expect(queue.canWrite('bob', 'alice')).toBe(true);
  });

  test('T07: 前の参加者による後の参加者の新規コードリジェクトに reason が必須', () => {
    const queue = new ParticipantQueue();
    const alice: Participant = { id: 'alice', publicKey: 'pk_a', joinedAt: 1000 };
    const bob: Participant = { id: 'bob', publicKey: 'pk_b', joinedAt: 2000 };
    queue.join(alice);
    queue.join(bob);
    // Alice (前) が Bob (後) をリジェクト（reason なし）
    expect(() => queue.validateReject('alice', 'bob', undefined)).toThrow('Earlier participant must provide reason');
    // Alice (前) が Bob (後) をリジェクト（reason あり）
    expect(() => queue.validateReject('alice', 'bob', 'Breaks API contract')).not.toThrow();
  });
});

describe('Group C: コード領域', () => {
  test('T08: CodeRegionMap.register() で領域を登録できる', () => {
    const map = new CodeRegionMap();
    map.register({
      id: 'r1',
      filePath: 'main.ts',
      startLine: 5,
      endLine: 10,
      ownerId: 'alice',
    });
    expect(map.getOwner('main.ts', 7)).toBe('alice');
  });

  test('T09: CodeRegionMap.getOwner(file, line) が所有者を返す', () => {
    const map = new CodeRegionMap();
    map.register({
      id: 'r1',
      filePath: 'main.ts',
      startLine: 5,
      endLine: 10,
      ownerId: 'alice',
    });
    expect(map.getOwner('main.ts', 5)).toBe('alice');
    expect(map.getOwner('main.ts', 10)).toBe('alice');
    expect(map.getOwner('main.ts', 4)).toBeNull();
    expect(map.getOwner('main.ts', 11)).toBeNull();
  });

  test('T10: 重複する CodeRegion は先に登録された方が優先される', () => {
    const map = new CodeRegionMap();
    map.register({
      id: 'r1',
      filePath: 'main.ts',
      startLine: 5,
      endLine: 10,
      ownerId: 'alice',
    });
    map.register({
      id: 'r2',
      filePath: 'main.ts',
      startLine: 5,
      endLine: 10,
      ownerId: 'bob',
    });
    expect(map.getOwner('main.ts', 7)).toBe('alice');
  });

  test('T11: 未登録行に対して getOwner() が null を返す', () => {
    const map = new CodeRegionMap();
    expect(map.getOwner('main.ts', 999)).toBeNull();
  });

  test('T12: getRegionsForFile() がファイル内の全領域を返す', () => {
    const map = new CodeRegionMap();
    map.register({
      id: 'r1',
      filePath: 'main.ts',
      startLine: 5,
      endLine: 10,
      ownerId: 'alice',
    });
    map.register({
      id: 'r2',
      filePath: 'main.ts',
      startLine: 15,
      endLine: 20,
      ownerId: 'bob',
    });
    map.register({
      id: 'r3',
      filePath: 'other.ts',
      startLine: 1,
      endLine: 5,
      ownerId: 'claude',
    });
    const regions = map.getRegionsForFile('main.ts');
    expect(regions).toHaveLength(2);
    expect(regions.map(r => r.ownerId).sort()).toEqual(['alice', 'bob']);
  });
});

describe('Group D: 操作ログ', () => {
  test('T13: OperationLog.append() で操作を追加できる', () => {
    const log = new OperationLog();
    const op: Operation = {
      id: 'op1',
      participantId: 'alice',
      regionId: 'r1',
      type: 'write',
      content: 'code',
      signature: 'sig',
      timestamp: 1000,
    };
    log.append(op);
    expect(log.getAll()).toHaveLength(1);
    expect(log.getAll()[0].id).toBe('op1');
  });

  test('T14: OperationLog.getByRegion() が領域の操作を時系列で返す', () => {
    const log = new OperationLog();
    log.append({
      id: 'op1',
      participantId: 'alice',
      regionId: 'r1',
      type: 'write',
      content: 'a',
      signature: 'sig1',
      timestamp: 3000,
    });
    log.append({
      id: 'op2',
      participantId: 'bob',
      regionId: 'r2',
      type: 'write',
      content: 'b',
      signature: 'sig2',
      timestamp: 2000,
    });
    log.append({
      id: 'op3',
      participantId: 'claude',
      regionId: 'r1',
      type: 'write',
      content: 'c',
      signature: 'sig3',
      timestamp: 1000,
    });
    const r1Ops = log.getByRegion('r1');
    expect(r1Ops).toHaveLength(2);
    expect(r1Ops[0].timestamp).toBe(1000);
    expect(r1Ops[1].timestamp).toBe(3000);
    expect(r1Ops[0].id).toBe('op3');
    expect(r1Ops[1].id).toBe('op1');
  });

  test('T15: OperationLog.serialize() が JSON 文字列を返す', () => {
    const log = new OperationLog();
    log.append({
      id: 'op1',
      participantId: 'alice',
      regionId: 'r1',
      type: 'write',
      content: 'code',
      signature: 'sig',
      timestamp: 1000,
    });
    const json = log.serialize();
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].id).toBe('op1');
  });

  test('T16: OperationLog.deserialize() が元のログを復元する', () => {
    const log1 = new OperationLog();
    log1.append({
      id: 'op1',
      participantId: 'alice',
      regionId: 'r1',
      type: 'write',
      content: 'code',
      signature: 'sig',
      timestamp: 1000,
    });
    const json = log1.serialize();
    const log2 = OperationLog.deserialize(json);
    expect(log2.getAll()).toHaveLength(1);
    expect(log2.getAll()[0].id).toBe('op1');
  });
});

describe('Group E: 署名', () => {
  test('T17: signOperation() が Ed25519 署名を返す', () => {
    const kp = generateKeyPair();
    const op: Operation = {
      id: 'op1',
      participantId: 'alice',
      regionId: 'r1',
      type: 'write',
      content: 'code',
      signature: '',
      timestamp: 1000,
    };
    const signature = signOperation(op, kp.secretKey);
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);
  });

  test('T18: verifyOperation() が正しい署名で true を返し、改竄で false を返す', () => {
    const kp = generateKeyPair();
    const op: Operation = {
      id: 'op1',
      participantId: 'alice',
      regionId: 'r1',
      type: 'write',
      content: 'original code',
      signature: '',
      timestamp: 1000,
    };
    const signature = signOperation(op, kp.secretKey);
    const signedOp = { ...op, signature };

    // 正しい署名
    expect(verifyOperation(signedOp, kp.publicKey)).toBe(true);

    // 改竄された操作
    const tamperedOp = { ...signedOp, content: 'tampered code' };
    expect(verifyOperation(tamperedOp, kp.publicKey)).toBe(false);
  });
});

describe('Group F: ルールエンジン', () => {
  test('T19: validateWrite() が参加列ルールに基づき write を許可/拒否する', () => {
    const queue = new ParticipantQueue();
    const regionMap = new CodeRegionMap();
    const engine = new RuleEngine(queue, regionMap);

    const kp = generateKeyPair();
    const alice: Participant = { id: 'alice', publicKey: kp.publicKey, joinedAt: 1000 };
    queue.join(alice);

    const op: Operation = {
      id: 'op1',
      participantId: 'alice',
      regionId: 'r1',
      type: 'write',
      content: 'code',
      signature: '',
      timestamp: 1000,
    };
    const signature = signOperation(op, kp.secretKey);
    const signedOp = { ...op, signature };

    // 正しい署名の write は許可される
    expect(() => engine.validateWrite(signedOp, kp.publicKey)).not.toThrow();

    // 不正な署名は拒否される
    const invalidOp = { ...signedOp, signature: 'invalid_sig' };
    expect(() => engine.validateWrite(invalidOp, kp.publicKey)).toThrow('Invalid signature');
  });

  test('T20: validateReject() が reason 欠落時にエラーを投げる', () => {
    const queue = new ParticipantQueue();
    const regionMap = new CodeRegionMap();
    const engine = new RuleEngine(queue, regionMap);

    const kpAlice = generateKeyPair();
    const kpBob = generateKeyPair();
    const alice: Participant = { id: 'alice', publicKey: kpAlice.publicKey, joinedAt: 1000 };
    const bob: Participant = { id: 'bob', publicKey: kpBob.publicKey, joinedAt: 2000 };
    queue.join(alice);
    queue.join(bob);

    // Alice (前) が Bob (後) をリジェクト（reason なし）
    const rejectOp: Operation = {
      id: 'op1',
      participantId: 'alice',
      regionId: 'r1',
      type: 'reject',
      content: '',
      reason: undefined,
      signature: '',
      timestamp: 3000,
    };
    const signature = signOperation(rejectOp, kpAlice.secretKey);
    const signedRejectOp = { ...rejectOp, signature };

    // reason なしでエラーになるはずだが、validateReject の実装次第
    // ここではテストの骨組みとして記述
    expect(() => engine.validateReject(signedRejectOp, kpAlice.publicKey)).toThrow();
  });
});
