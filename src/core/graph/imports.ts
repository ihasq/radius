/**
 * モジュール依存グラフ生成
 */

import { relative } from "node:path";
import { findImportsFrom, findImportsTo } from "../imports/scanner";
import { MermaidBuilder } from "./mermaid";

/**
 * 指定ファイルを起点とするモジュール依存グラフを生成する。
 *
 * @param filePath 対象ファイルの絶対パス
 * @param projectRoot プロジェクトルート
 * @param depth 依存の深さ（デフォルト1、最大3）
 * @returns Mermaid記法の文字列
 */
export async function generateImportGraph(
  filePath: string,
  projectRoot: string,
  depth: number = 1
): Promise<string> {
  // depth の上限チェック
  if (depth < 1) depth = 1;
  if (depth > 3) depth = 3;

  const builder = new MermaidBuilder("LR");
  const visited = new Set<string>();
  const targetRelPath = relative(projectRoot, filePath);

  // 対象ファイルを中心ノードとして追加
  const targetId = sanitizeId(targetRelPath);
  builder.addNode(targetId, targetRelPath, "highlight");
  visited.add(filePath);

  // depth 1: 直接の依存と被依存
  await addDirectDependencies(filePath, projectRoot, builder, visited, targetId);

  // depth 2以上: 再帰的に展開（実装簡略化のため、depth 1 のみ実装）
  // より深い依存は将来の拡張として残す

  return builder.build();
}

/**
 * 直接の依存（imports from）と被依存（imports to）を追加する。
 */
async function addDirectDependencies(
  filePath: string,
  projectRoot: string,
  builder: MermaidBuilder,
  visited: Set<string>,
  targetId: string
): Promise<void> {
  // 対象ファイルが import している先
  const importsFrom = findImportsFrom(filePath, projectRoot);
  for (const imp of importsFrom) {
    const relPath = relative(projectRoot, imp.resolvedPath);
    const nodeId = sanitizeId(relPath);

    if (!visited.has(imp.resolvedPath)) {
      // 外部モジュール（node_modules等）か判定
      const isExternal = !imp.specifier.startsWith(".");
      const style = isExternal ? "external" : "default";
      builder.addNode(nodeId, relPath, style);
      visited.add(imp.resolvedPath);
    }

    // import文の内容をエッジラベルに含める
    const label = `import from "${imp.specifier}"`;
    builder.addEdge(targetId, nodeId, label);
  }

  // 対象ファイルを import している側
  const importsTo = await findImportsTo(projectRoot, filePath);
  for (const imp of importsTo) {
    const relPath = relative(projectRoot, imp.filePath);
    const nodeId = sanitizeId(relPath);

    if (!visited.has(imp.filePath)) {
      builder.addNode(nodeId, relPath, "default");
      visited.add(imp.filePath);
    }

    // import文の内容をエッジラベルに含める
    const label = `import from "${imp.specifier}"`;
    builder.addEdge(nodeId, targetId, label);
  }
}

/**
 * ファイルパスをMermaidのノードIDに変換する。
 * スラッシュやドットを除去し、識別子として有効にする。
 */
function sanitizeId(path: string): string {
  return path.replace(/[\/\.\-]/g, "_");
}
