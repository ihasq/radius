/**
 * depth.ts - Import depth resolution utilities
 *
 * depth-2: 直接 import のみ解決（再帰的な依存は走査しない）
 */

import ts from "typescript";
import { resolve, dirname, join } from "node:path";
import { existsSync } from "node:fs";

/**
 * ファイルから直接 import されているモジュールのパスを抽出する。
 * depth-2: 再帰的な走査は行わない。
 *
 * @param sourceFile 解析対象のSourceFile
 * @param filePath ファイルの絶対パス
 * @param projectRoot プロジェクトルート
 * @returns 直接importされているファイルパスの配列
 */
export function getDirectImports(
  sourceFile: ts.SourceFile,
  filePath: string,
  projectRoot: string
): string[] {
  const imports: string[] = [];
  const fileDir = dirname(filePath);

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;

      // 相対パスのimportを解決
      if (moduleSpecifier.startsWith(".")) {
        const resolvedPath = resolveRelativePath(moduleSpecifier, fileDir);
        if (resolvedPath && existsSync(resolvedPath)) {
          imports.push(resolvedPath);
        }
      }
      // node_modules からの import (@types 含む) は対象外
      // depth-2 では直接の相対パスのみを解決する
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return imports;
}

/**
 * 相対パスを解決する。拡張子がない場合は .ts または .tsx を試す。
 */
function resolveRelativePath(moduleSpecifier: string, baseDir: string): string | null {
  const basePath = join(baseDir, moduleSpecifier);

  // 拡張子付きの場合
  if (moduleSpecifier.endsWith(".ts") || moduleSpecifier.endsWith(".tsx")) {
    return resolve(basePath);
  }

  // 拡張子なしの場合、.ts または .tsx を試す
  const candidates = [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return resolve(candidate);
    }
  }

  return null;
}
