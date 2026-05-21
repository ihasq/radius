/**
 * DAP (Debug Adapter Protocol) Client
 *
 * Phase 6: 最小実装（スタブ）
 * 実際の DAP 通信は将来の実装で追加予定
 */

export interface DebugSession {
  id: string;
  file: string;
  started: Date;
}

export interface Breakpoint {
  id: number;
  file: string;
  line: number;
}

/**
 * DAP クライアント（スタブ実装）
 */
export class DapClient {
  private sessions: Map<string, DebugSession> = new Map();
  private breakpoints: Breakpoint[] = [];
  private nextBreakpointId = 1;
  private currentSessionId: string | null = null;

  /**
   * デバッグセッションを開始
   */
  async startSession(file: string): Promise<string> {
    const sessionId = `session-${Date.now()}`;
    const session: DebugSession = {
      id: sessionId,
      file,
      started: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.currentSessionId = sessionId;

    return sessionId;
  }

  /**
   * デバッグセッションを停止
   */
  async stopSession(sessionId?: string): Promise<void> {
    const id = sessionId || this.currentSessionId;
    if (id) {
      this.sessions.delete(id);
      if (this.currentSessionId === id) {
        this.currentSessionId = null;
      }
    }
  }

  /**
   * ブレークポイントを設定
   */
  async setBreakpoint(file: string, line: number): Promise<Breakpoint> {
    const breakpoint: Breakpoint = {
      id: this.nextBreakpointId++,
      file,
      line,
    };
    this.breakpoints.push(breakpoint);
    return breakpoint;
  }

  /**
   * ブレークポイント一覧を取得
   */
  getBreakpoints(): Breakpoint[] {
    return [...this.breakpoints];
  }

  /**
   * プログラムを続行
   */
  async continue(): Promise<void> {
    // Phase 6: スタブ
    return Promise.resolve();
  }

  /**
   * ステップ実行
   */
  async step(): Promise<void> {
    // Phase 6: スタブ
    return Promise.resolve();
  }

  /**
   * 変数を評価
   */
  async evaluate(expression: string): Promise<string> {
    // Phase 6: スタブ - ダミー値を返す
    return `<value of ${expression}>`;
  }

  /**
   * セッション一覧を取得
   */
  getSessions(): DebugSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 現在のセッション情報を取得
   */
  getCurrentSession(): DebugSession | null {
    if (!this.currentSessionId) return null;
    return this.sessions.get(this.currentSessionId) || null;
  }
}
