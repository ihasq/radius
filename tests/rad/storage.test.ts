import { describe, test, expect } from 'bun:test';
import type { RadStore } from '../../rad/src/store/interface';
import { MemoryRadStore } from '../../rad/src/store/memory';
import type { Operation } from '../../rad/src/types';

// テストヘルパー
function createTestOp(overrides?: Partial<Operation>): Operation {
  return {
    id: 'op-' + Math.random().toString(36).slice(2),
    participantId: 'alice',
    regionId: 'r1',
    type: 'write',
    content: 'const a = 1;',
    signature: 'test-sig',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('Group A: RadStore インタフェース検証', () => {
  test('T01: RadStore インタフェースが putOp, getOps, putSnapshot, getSnapshot, compact を持つ', () => {
    const store = new MemoryRadStore();
    expect(typeof store.putOp).toBe('function');
    expect(typeof store.getOps).toBe('function');
    expect(typeof store.putSnapshot).toBe('function');
    expect(typeof store.getSnapshot).toBe('function');
    expect(typeof store.compact).toBe('function');
  });

  test('T02: RadStore インタフェースが putOpBatch を持つ', () => {
    const store = new MemoryRadStore();
    expect(typeof store.putOpBatch).toBe('function');
  });

  test('T03: RadStore インタフェースが getSnapshotList を持つ（全ファイル一覧）', () => {
    const store = new MemoryRadStore();
    expect(typeof store.getSnapshotList).toBe('function');
  });
});

describe('Group B: MemoryRadStore 基本操作', () => {
  test('T04: putOp(op) で操作を保存し getOps(regionId) で取得できる', async () => {
    const store = new MemoryRadStore();
    const op = createTestOp({ regionId: 'r1' });
    await store.putOp(op);
    const ops = await store.getOps('r1');
    expect(ops).toHaveLength(1);
    expect(ops[0].id).toBe(op.id);
  });

  test('T05: putOp を10件追加後、getOps が timestamp 順で返す', async () => {
    const store = new MemoryRadStore();
    const baseTime = Date.now();
    for (let i = 0; i < 10; i++) {
      const op = createTestOp({ regionId: 'r1', timestamp: baseTime + (9 - i) * 1000 });
      await store.putOp(op);
    }
    const ops = await store.getOps('r1');
    expect(ops).toHaveLength(10);
    for (let i = 1; i < ops.length; i++) {
      expect(ops[i].timestamp).toBeGreaterThanOrEqual(ops[i - 1].timestamp);
    }
  });

  test('T06: putSnapshot(filePath, content) で保存し getSnapshot(filePath) で取得できる', async () => {
    const store = new MemoryRadStore();
    await store.putSnapshot('main.ts', 'const a = 1;');
    const content = await store.getSnapshot('main.ts');
    expect(content).toBe('const a = 1;');
  });

  test('T07: getSnapshot で未保存のファイルは null を返す', async () => {
    const store = new MemoryRadStore();
    const content = await store.getSnapshot('nonexistent.ts');
    expect(content).toBeNull();
  });

  test('T08: getSnapshotList() が全ファイルパスを返す', async () => {
    const store = new MemoryRadStore();
    await store.putSnapshot('main.ts', 'a');
    await store.putSnapshot('utils.ts', 'b');
    await store.putSnapshot('index.ts', 'c');
    const list = await store.getSnapshotList();
    expect(list).toHaveLength(3);
    expect(list.sort()).toEqual(['index.ts', 'main.ts', 'utils.ts']);
  });
});

describe('Group C: バッチ操作', () => {
  test('T09: putOpBatch([op1, op2, op3]) で3件が保存される', async () => {
    const store = new MemoryRadStore();
    const ops = [
      createTestOp({ regionId: 'r1' }),
      createTestOp({ regionId: 'r2' }),
      createTestOp({ regionId: 'r3' }),
    ];
    await store.putOpBatch(ops);
    const allOps = await store.getAllOps();
    expect(allOps).toHaveLength(3);
  });

  test('T10: putOpBatch の各操作が getOps で取得できる', async () => {
    const store = new MemoryRadStore();
    const ops = [
      createTestOp({ regionId: 'r1', content: 'a' }),
      createTestOp({ regionId: 'r1', content: 'b' }),
      createTestOp({ regionId: 'r2', content: 'c' }),
    ];
    await store.putOpBatch(ops);
    const r1Ops = await store.getOps('r1');
    expect(r1Ops).toHaveLength(2);
    expect(r1Ops.map(op => op.content).sort()).toEqual(['a', 'b']);
  });
});

describe('Group D: シリアライズ', () => {
  test('T11: MemoryRadStore.serialize() が全データの JSON 文字列を返す', async () => {
    const store = new MemoryRadStore();
    await store.putOp(createTestOp({ regionId: 'r1' }));
    await store.putSnapshot('main.ts', 'const a = 1;');
    const json = store.serialize();
    expect(typeof json).toBe('string');
    const data = JSON.parse(json);
    expect(data.ops).toHaveLength(1);
    expect(data.snapshots['main.ts']).toBe('const a = 1;');
  });

  test('T12: MemoryRadStore.deserialize(json) が元のデータを完全に復元する', async () => {
    const store1 = new MemoryRadStore();
    await store1.putOp(createTestOp({ regionId: 'r1', content: 'original' }));
    await store1.putSnapshot('main.ts', 'const a = 1;');
    await store1.putSnapshot('utils.ts', 'export const b = 2;');

    const json = store1.serialize();
    const store2 = MemoryRadStore.deserialize(json);

    const ops = await store2.getOps('r1');
    expect(ops).toHaveLength(1);
    expect(ops[0].content).toBe('original');

    const mainContent = await store2.getSnapshot('main.ts');
    expect(mainContent).toBe('const a = 1;');

    const utilsContent = await store2.getSnapshot('utils.ts');
    expect(utilsContent).toBe('export const b = 2;');

    const list = await store2.getSnapshotList();
    expect(list).toHaveLength(2);
  });
});

describe('Group E: コンパクション', () => {
  test('T13: compact() 後に getSnapshot() が操作ログから再構築された最新内容を返す', async () => {
    const store = new MemoryRadStore();
    await store.putOp(createTestOp({
      regionId: 'main.ts:1-3',
      content: 'const a = 1;',
      timestamp: 1000,
    }));
    await store.putOp(createTestOp({
      regionId: 'main.ts:1-3',
      content: 'const a = 2;',
      timestamp: 2000,
    }));

    await store.compact();

    const snapshot = await store.getSnapshot('main.ts');
    expect(snapshot).toBe('const a = 2;');
  });

  test('T14: compact() 後に getOps() が空配列を返す（適用済みログ削除）', async () => {
    const store = new MemoryRadStore();
    await store.putOp(createTestOp({ regionId: 'main.ts:1-3', timestamp: 1000 }));
    await store.putOp(createTestOp({ regionId: 'main.ts:1-3', timestamp: 2000 }));

    await store.compact();

    const ops = await store.getOps('main.ts:1-3');
    expect(ops).toHaveLength(0);
  });

  test('T15: 同一領域への複数 write の compact() が最新の write のみを反映する', async () => {
    const store = new MemoryRadStore();
    await store.putOp(createTestOp({
      regionId: 'main.ts:1-3',
      content: 'version 1',
      timestamp: 1000,
    }));
    await store.putOp(createTestOp({
      regionId: 'main.ts:1-3',
      content: 'version 2',
      timestamp: 2000,
    }));
    await store.putOp(createTestOp({
      regionId: 'main.ts:1-3',
      content: 'version 3',
      timestamp: 3000,
    }));

    await store.compact();

    const snapshot = await store.getSnapshot('main.ts');
    expect(snapshot).toBe('version 3');
  });

  test('T16: 複数ファイルへの write の compact() が各ファイルの最新状態を返す', async () => {
    const store = new MemoryRadStore();
    await store.putOp(createTestOp({
      regionId: 'main.ts:1-3',
      content: 'main content',
      timestamp: 1000,
    }));
    await store.putOp(createTestOp({
      regionId: 'utils.ts:1-5',
      content: 'utils content',
      timestamp: 2000,
    }));
    await store.putOp(createTestOp({
      regionId: 'index.ts:1-1',
      content: 'index content',
      timestamp: 3000,
    }));

    await store.compact();

    const mainSnapshot = await store.getSnapshot('main.ts');
    expect(mainSnapshot).toBe('main content');

    const utilsSnapshot = await store.getSnapshot('utils.ts');
    expect(utilsSnapshot).toBe('utils content');

    const indexSnapshot = await store.getSnapshot('index.ts');
    expect(indexSnapshot).toBe('index content');

    const list = await store.getSnapshotList();
    expect(list).toHaveLength(3);
  });
});
