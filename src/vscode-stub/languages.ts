/**
 * VSCode languages API スタブ
 *
 * language server protocol の registerProvider 系 API を提供する。
 * 実際には rdsx-resolver に委譲する。
 */

interface Disposable {
  dispose(): void;
}

/**
 * 補完プロバイダを登録（no-op）
 */
export function registerCompletionItemProvider(
  selector: any,
  provider: any,
  ...triggerCharacters: string[]
): Disposable {
  // Phase 4: スタブ実装（登録のみ、実際の動作はなし）
  return {
    dispose: () => {
      // no-op
    },
  };
}

/**
 * ホバープロバイダを登録（no-op）
 */
export function registerHoverProvider(selector: any, provider: any): Disposable {
  return {
    dispose: () => {},
  };
}

/**
 * 定義プロバイダを登録（no-op）
 */
export function registerDefinitionProvider(selector: any, provider: any): Disposable {
  return {
    dispose: () => {},
  };
}

/**
 * 参照プロバイダを登録（no-op）
 */
export function registerReferenceProvider(selector: any, provider: any): Disposable {
  return {
    dispose: () => {},
  };
}

/**
 * リネームプロバイダを登録（no-op）
 */
export function registerRenameProvider(selector: any, provider: any): Disposable {
  return {
    dispose: () => {},
  };
}

/**
 * ドキュメントシンボルプロバイダを登録（no-op）
 */
export function registerDocumentSymbolProvider(selector: any, provider: any): Disposable {
  return {
    dispose: () => {},
  };
}

/**
 * フォーマットプロバイダを登録（no-op）
 */
export function registerDocumentFormattingEditProvider(selector: any, provider: any): Disposable {
  return {
    dispose: () => {},
  };
}

/**
 * コードアクションプロバイダを登録（no-op）
 */
export function registerCodeActionsProvider(selector: any, provider: any): Disposable {
  return {
    dispose: () => {},
  };
}
