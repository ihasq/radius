/**
 * radls-resolver - ファイル拡張子に基づいて適切な RadlsProvider を返す
 *
 * Phase 2: TypeScript のみ対応
 * Phase 7: 他言語 (Rust, C++, Go, Zig) を追加
 */

import type { RadlsProvider } from "@radius/radls-ts/interface";
import { TsRadProvider } from "@radius/radls-ts/provider";

/**
 * プロバイダのキャッシュ (言語ごとに1インスタンス)
 */
const providerCache = new Map<string, RadlsProvider>();

/**
 * ファイルパスから拡張子を取得
 */
function getExtension(filePath: string): string {
  const match = filePath.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : "";
}

/**
 * ファイルパスに基づいて適切な RadlsProvider を返す
 *
 * @param filePath - ファイルパス
 * @returns RadlsProvider または null (対応していない言語の場合)
 */
export function resolveProvider(filePath: string): RadlsProvider | null {
  const ext = getExtension(filePath);

  // TypeScript / JavaScript
  if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx") {
    if (!providerCache.has("typescript")) {
      providerCache.set("typescript", new TsRadProvider());
    }
    return providerCache.get("typescript")!;
  }

  // Phase 7 で他言語を追加:
  // - Rust: rs
  // - C++: cpp, cc, cxx, h, hpp
  // - Go: go
  // - Zig: zig

  // 未対応の言語
  return null;
}

/**
 * すべてのプロバイダをクリーンアップ
 */
export async function disposeAllProviders(): Promise<void> {
  const providers = Array.from(providerCache.values());
  await Promise.all(providers.map((p) => p.dispose()));
  providerCache.clear();
}
