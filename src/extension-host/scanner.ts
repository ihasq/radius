/**
 * Extension scanner。
 *
 * ディレクトリから package.json を読み取り、ResolvedExtension を生成する。
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type {
  ExtensionManifest,
  ResolvedExtension,
} from "./types";

/**
 * 拡張ディレクトリをスキャンし、ResolvedExtension を返す。
 *
 * @param extensionDir 拡張ディレクトリの絶対パス
 * @returns ResolvedExtension または null（有効な拡張でない場合）
 */
export function scanExtension(extensionDir: string): ResolvedExtension | null {
  const packageJsonPath = join(extensionDir, "package.json");

  // package.json が存在しない
  if (!existsSync(packageJsonPath)) {
    return null;
  }

  let manifest: ExtensionManifest;
  try {
    const content = readFileSync(packageJsonPath, "utf-8");
    manifest = JSON.parse(content);
  } catch (err) {
    console.warn(`[scanner] Failed to parse package.json: ${packageJsonPath}`);
    return null;
  }

  // 必須フィールドチェック
  if (!manifest.name || !manifest.publisher) {
    console.warn(`[scanner] Missing name or publisher in: ${packageJsonPath}`);
    return null;
  }

  // engines.vscode フィールドが存在しない場合は VSCode 拡張ではない
  if (!manifest.engines?.vscode) {
    return null;
  }

  // 拡張ID を生成
  const id = `${manifest.publisher}.${manifest.name}`;

  // entryPoint を解決
  let entryPoint: string | null = null;
  if (manifest.main) {
    entryPoint = resolve(extensionDir, manifest.main);
    // .js 拡張子がない場合は追加して試行
    if (!existsSync(entryPoint) && !entryPoint.endsWith(".js")) {
      const withJs = `${entryPoint}.js`;
      if (existsSync(withJs)) {
        entryPoint = withJs;
      } else {
        console.warn(`[scanner] Entry point not found: ${entryPoint}`);
        entryPoint = null;
      }
    } else if (!existsSync(entryPoint)) {
      console.warn(`[scanner] Entry point not found: ${entryPoint}`);
      entryPoint = null;
    }
  }

  // fileExtensionMap を構築
  const fileExtensionMap = new Map<string, string>();
  const languages = manifest.contributes?.languages || [];
  for (const lang of languages) {
    const languageId = lang.id;
    const extensions = lang.extensions || [];
    for (const ext of extensions) {
      fileExtensionMap.set(ext, languageId);
    }
  }

  return {
    id,
    manifest,
    extensionPath: extensionDir,
    entryPoint,
    fileExtensionMap,
  };
}
