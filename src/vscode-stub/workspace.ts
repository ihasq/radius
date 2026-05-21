/**
 * VSCode workspace API スタブ
 *
 * ワークスペース設定、ファイル操作などを提供する。
 */

interface Disposable {
  dispose(): void;
}

/**
 * 設定オブジェクト（空の設定を返す）
 */
class Configuration {
  get<T>(section: string, defaultValue?: T): T | undefined {
    return defaultValue;
  }

  has(section: string): boolean {
    return false;
  }

  inspect(section: string): any {
    return undefined;
  }

  update(section: string, value: any, configurationTarget?: any): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * ワークスペース設定を取得
 */
export function getConfiguration(section?: string): Configuration {
  return new Configuration();
}

/**
 * テキストドキュメントを開く（no-op）
 */
export function openTextDocument(uri: string | any): Promise<any> {
  return Promise.resolve({
    uri: typeof uri === "string" ? uri : uri.fsPath,
    getText: () => "",
    lineCount: 0,
  });
}

/**
 * 設定変更イベント（no-op）
 */
export function onDidChangeConfiguration(listener: (e: any) => void): Disposable {
  return {
    dispose: () => {},
  };
}

/**
 * ファイル変更イベント（no-op）
 */
export function onDidChangeTextDocument(listener: (e: any) => void): Disposable {
  return {
    dispose: () => {},
  };
}

/**
 * ファイル保存イベント（no-op）
 */
export function onDidSaveTextDocument(listener: (doc: any) => void): Disposable {
  return {
    dispose: () => {},
  };
}

/**
 * ワークスペースフォルダ（空配列）
 */
export const workspaceFolders: any[] = [];

/**
 * ルートパス（未定義）
 */
export const rootPath: string | undefined = undefined;
