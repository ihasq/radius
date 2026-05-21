/**
 * radls-resolver - ファイル拡張子に基づいて適切な RadlsProvider を返す
 *
 * Phase 2: TypeScript のみ対応（TsRadProvider: in-process）
 * Phase 3: tsgo 移行（TsgoProvider: subprocess）
 * Phase 7: 他言語 (Rust, C++, Go, Zig) を追加
 */

import type { RadlsProvider } from "@radius/radls-ts/interface";
import { TsRadProvider } from "@radius/radls-ts/provider";
// Phase 3: TsgoProvider import disabled temporarily to test
// import { TsgoProvider } from "@radius/radls-ts/tsgo-provider";
// import { findProjectRoot } from "../shared/project";

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
 * ファイルパスと depth に基づいて適切な RadlsProvider を返す
 *
 * @param filePath - ファイルパス
 * @param depth - 深さ (0: なし, 1: パースのみ, 2-4: 型解決)
 * @returns RadlsProvider または null (対応していない言語の場合)
 */
export async function resolveProvider(filePath: string, depth: number = 1): Promise<RadlsProvider | null> {
  const ext = getExtension(filePath);

  // TypeScript / JavaScript
  if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx") {
    // depth ≤ 1: in-process TsRadProvider (パースのみ、高速)
    if (depth <= 1) {
      if (!providerCache.has("typescript-inprocess")) {
        providerCache.set("typescript-inprocess", new TsRadProvider());
      }
      return providerCache.get("typescript-inprocess")!;
    }

    // depth ≥ 2: tsgo subprocess (型解決・参照・診断)
    if (!providerCache.has("typescript-tsgo")) {
      const { TsgoProvider } = await import("@radius/radls-ts/tsgo-provider");
      const { findProjectRoot } = await import("../shared/project");
      const projectRoot = findProjectRoot(filePath);
      const rootUri = `file://${projectRoot}`;
      providerCache.set("typescript-tsgo", new TsgoProvider(rootUri));
    }
    return providerCache.get("typescript-tsgo")!;
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
