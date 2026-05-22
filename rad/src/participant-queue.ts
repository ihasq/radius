import type { Participant } from './types';

export class ParticipantQueue {
  private queue: Participant[] = [];
  private orderMap = new Map<string, number>();

  join(p: Participant): void {
    if (this.orderMap.has(p.id)) return; // 重複参加防止
    this.orderMap.set(p.id, this.queue.length);
    this.queue.push(p);
  }

  getOrder(participantId: string): number {
    const order = this.orderMap.get(participantId);
    if (order === undefined) throw new Error('Participant not found: ' + participantId);
    return order;
  }

  isBefore(a: string, b: string): boolean {
    return this.getOrder(a) < this.getOrder(b);
  }

  /** 後→前の上書きは自由。前→後の上書きも自由（コード改善）。 */
  canWrite(writerId: string, regionOwnerId: string): boolean {
    // 全ての参加者が任意の領域に書ける
    // 制約はリジェクト時のみ発生する
    return true;
  }

  /** 前→後のリジェクトは reason 必須 */
  validateReject(rejecterId: string, targetId: string, reason?: string): void {
    if (this.isBefore(rejecterId, targetId) && !reason) {
      throw new Error('Earlier participant must provide reason to reject later participant');
    }
  }

  getAll(): Participant[] { return [...this.queue]; }
}
