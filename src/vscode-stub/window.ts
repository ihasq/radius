/**
 * VSCode window API スタブ
 *
 * UI 関連の API を提供する（全て no-op）。
 */

interface Disposable {
  dispose(): void;
}

/**
 * 情報メッセージを表示（no-op）
 */
export function showInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
  return Promise.resolve(undefined);
}

/**
 * エラーメッセージを表示（no-op）
 */
export function showErrorMessage(message: string, ...items: string[]): Promise<string | undefined> {
  return Promise.resolve(undefined);
}

/**
 * 警告メッセージを表示（no-op）
 */
export function showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
  return Promise.resolve(undefined);
}

/**
 * ステータスバーメッセージを設定（no-op）
 */
export function setStatusBarMessage(text: string, hideAfterTimeout?: number): Disposable {
  return {
    dispose: () => {},
  };
}

/**
 * ツリービューを作成（no-op）
 */
export function createTreeView(viewId: string, options: any): any {
  return {
    dispose: () => {},
    reveal: () => Promise.resolve(),
    onDidChangeVisibility: (listener: any) => ({ dispose: () => {} }),
  };
}

/**
 * 出力チャンネルを作成（no-op）
 */
export function createOutputChannel(name: string): any {
  return {
    append: () => {},
    appendLine: () => {},
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
  };
}

/**
 * クイックピックを表示（no-op）
 */
export function showQuickPick(items: any[], options?: any): Promise<any> {
  return Promise.resolve(undefined);
}

/**
 * 入力ボックスを表示（no-op）
 */
export function showInputBox(options?: any): Promise<string | undefined> {
  return Promise.resolve(undefined);
}

/**
 * テキストドキュメントを表示（no-op）
 */
export function showTextDocument(document: any, options?: any): Promise<any> {
  return Promise.resolve({});
}

/**
 * アクティブなテキストエディタ（undefined）
 */
export const activeTextEditor: any = undefined;

/**
 * 全てのテキストエディタ（空配列）
 */
export const visibleTextEditors: any[] = [];
