/**
 * Extension Host 型定義。
 *
 * VSCode拡張のメタデータと解決済み拡張情報を定義する。
 */

/** 拡張の package.json から抽出するメタデータ。 */
export interface ExtensionManifest {
  name: string;
  publisher: string;
  version: string;
  /** 拡張のエントリポイント（相対パス）。例: "./dist/extension.js" */
  main?: string;
  engines?: { vscode?: string };
  activationEvents?: string[];
  contributes?: {
    languages?: ExtensionLanguageContribution[];
    grammars?: ExtensionGrammarContribution[];
  };
}

export interface ExtensionLanguageContribution {
  id: string;
  aliases?: string[];
  extensions?: string[];      // ファイル拡張子。例: [".rs", ".rust"]
  filenames?: string[];       // 特定のファイル名。例: ["Makefile"]
  configuration?: string;     // language-configuration.json パス
}

export interface ExtensionGrammarContribution {
  language: string;
  scopeName: string;
  path: string;
}

/** 解決済みの拡張情報。スキャン後に生成される。 */
export interface ResolvedExtension {
  /** publisher.name 形式の一意ID。 */
  id: string;
  manifest: ExtensionManifest;
  /** 拡張ディレクトリの絶対パス。 */
  extensionPath: string;
  /** main フィールドの解決済み絶対パス。 */
  entryPoint: string | null;
  /** この拡張がサポートするファイル拡張子 → languageId のマップ。 */
  fileExtensionMap: Map<string, string>;
}

/** レジストリ保存用の ResolvedExtension（Map を Record に変換）。 */
export interface SerializedExtension {
  id: string;
  manifest: ExtensionManifest;
  extensionPath: string;
  entryPoint: string | null;
  fileExtensionMap: Record<string, string>;
}
