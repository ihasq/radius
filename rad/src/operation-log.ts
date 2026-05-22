import type { Operation } from './types';

export class OperationLog {
  private ops: Operation[] = [];

  append(op: Operation): void {
    this.ops.push(op);
  }

  getByRegion(regionId: string): Operation[] {
    return this.ops
      .filter(op => op.regionId === regionId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  getByParticipant(participantId: string): Operation[] {
    return this.ops
      .filter(op => op.participantId === participantId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  getAll(): Operation[] {
    return [...this.ops].sort((a, b) => a.timestamp - b.timestamp);
  }

  serialize(): string {
    return JSON.stringify(this.ops);
  }

  static deserialize(json: string): OperationLog {
    const log = new OperationLog();
    const ops: Operation[] = JSON.parse(json);
    for (const op of ops) log.append(op);
    return log;
  }
}
