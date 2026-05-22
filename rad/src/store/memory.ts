import type { Operation } from '../types';
import type { RadStore } from './interface';
import { compactStore } from './compactor';

export class MemoryRadStore implements RadStore {
  private ops: Operation[] = [];
  private snapshots = new Map<string, string>();

  async putOp(op: Operation): Promise<void> {
    this.ops.push(op);
  }

  async putOpBatch(ops: Operation[]): Promise<void> {
    this.ops.push(...ops);
  }

  async getOps(regionId: string): Promise<Operation[]> {
    return this.ops
      .filter(op => op.regionId === regionId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async getAllOps(): Promise<Operation[]> {
    return [...this.ops].sort((a, b) => a.timestamp - b.timestamp);
  }

  async putSnapshot(filePath: string, content: string): Promise<void> {
    this.snapshots.set(filePath, content);
  }

  async getSnapshot(filePath: string): Promise<string | null> {
    return this.snapshots.get(filePath) ?? null;
  }

  async getSnapshotList(): Promise<string[]> {
    return [...this.snapshots.keys()];
  }

  async compact(): Promise<void> {
    await compactStore(this);
  }

  async clearOps(): Promise<void> {
    this.ops = [];
  }

  serialize(): string {
    return JSON.stringify({
      ops: this.ops,
      snapshots: Object.fromEntries(this.snapshots),
    });
  }

  static deserialize(json: string): MemoryRadStore {
    const data = JSON.parse(json);
    const store = new MemoryRadStore();
    for (const op of data.ops) store.ops.push(op);
    for (const [k, v] of Object.entries(data.snapshots)) {
      store.snapshots.set(k, v as string);
    }
    return store;
  }
}
