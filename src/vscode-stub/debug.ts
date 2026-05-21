/**
 * VSCode debug API スタブ
 *
 * Phase 4: スタブ実装（no-op）
 * Phase 6: DAP 統合で実装を差し替え
 */

interface Disposable {
  dispose(): void;
}

/**
 * デバッグセッションを開始（Phase 6 で実装）
 */
export function startDebugging(
  folder: any,
  nameOrConfiguration: string | any,
  parentSession?: any
): Promise<boolean> {
  // Phase 4: スタブ（常に false を返す）
  // Phase 6: DAP クライアントに委譲
  return Promise.resolve(false);
}

/**
 * デバッグセッションを停止（Phase 6 で実装）
 */
export function stopDebugging(session?: any): Promise<void> {
  return Promise.resolve();
}

/**
 * ブレークポイント変更イベント（no-op）
 */
export function onDidChangeBreakpoints(listener: (e: any) => void): Disposable {
  return {
    dispose: () => {},
  };
}

/**
 * デバッグセッション開始イベント（no-op）
 */
export function onDidStartDebugSession(listener: (session: any) => void): Disposable {
  return {
    dispose: () => {},
  };
}

/**
 * デバッグセッション終了イベント（no-op）
 */
export function onDidTerminateDebugSession(listener: (session: any) => void): Disposable {
  return {
    dispose: () => {},
  };
}

/**
 * アクティブなデバッグセッション（undefined）
 */
export const activeDebugSession: any = undefined;

/**
 * ブレークポイント一覧（空配列）
 */
export const breakpoints: any[] = [];
