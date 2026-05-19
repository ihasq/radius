/**
 * ファイルコンテキスト生成
 *
 * ファイルの import/export を解析し、## context セクションを生成する。
 */

import { extname } from "node:path";

export interface FileContext {
  exports: string[];
  imports: ImportInfo[];
}

export interface ImportInfo {
  path: string;
  symbols: string[];
}

/**
 * 対応するファイル拡張子
 */
const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

/**
 * ファイル内容から export/import を抽出する。
 * TypeScript/JavaScript ファイルのみ対応。
 */
export function analyzeFileContext(filePath: string, content: string): FileContext | null {
  const ext = extname(filePath);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return null;
  }

  const exports: string[] = [];
  const imports: ImportInfo[] = [];

  // Export 検出
  // export function name() → "name()"
  const funcExports = content.matchAll(/export\s+function\s+(\w+)/g);
  for (const match of funcExports) {
    exports.push(`${match[1]}()`);
  }

  // export const/let/var name → "name"
  const varExports = content.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g);
  for (const match of varExports) {
    exports.push(match[1]);
  }

  // export class Name → "Name"
  const classExports = content.matchAll(/export\s+class\s+(\w+)/g);
  for (const match of classExports) {
    exports.push(match[1]);
  }

  // export interface Name → "Name"
  const interfaceExports = content.matchAll(/export\s+interface\s+(\w+)/g);
  for (const match of interfaceExports) {
    exports.push(match[1]);
  }

  // export type Name → "Name"
  const typeExports = content.matchAll(/export\s+type\s+(\w+)/g);
  for (const match of typeExports) {
    exports.push(match[1]);
  }

  // export { name1, name2 } → "name1", "name2"
  const namedExports = content.matchAll(/export\s*\{([^}]+)\}/g);
  for (const match of namedExports) {
    const names = match[1].split(",").map((s) => s.trim()).filter((s) => s);
    for (const name of names) {
      // "name as alias" の場合は "name" のみ取得
      const cleanName = name.split(/\s+as\s+/)[0].trim();
      if (cleanName && !exports.includes(cleanName)) {
        exports.push(cleanName);
      }
    }
  }

  // export default → "default"
  if (/export\s+default/.test(content)) {
    if (!exports.includes("default")) {
      exports.push("default");
    }
  }

  // Import 検出
  // import { name1, name2 } from "path" → { path, symbols: ["name1", "name2"] }
  const namedImports = content.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g);
  for (const match of namedImports) {
    const symbols = match[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter((s) => s);
    imports.push({
      path: match[2],
      symbols,
    });
  }

  // import name from "path" → { path, symbols: ["name"] }
  const defaultImports = content.matchAll(/import\s+(\w+)\s+from\s*["']([^"']+)["']/g);
  for (const match of defaultImports) {
    imports.push({
      path: match[2],
      symbols: [match[1]],
    });
  }

  // import * as name from "path" → { path, symbols: ["* as name"] }
  const namespaceImports = content.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s*["']([^"']+)["']/g);
  for (const match of namespaceImports) {
    imports.push({
      path: match[2],
      symbols: [`* as ${match[1]}`],
    });
  }

  return { exports, imports };
}

/**
 * FileContext を ## context セクションのテキストに変換する。
 */
export function formatContextSection(ctx: FileContext): string {
  const lines: string[] = [];

  if (ctx.exports.length > 0 || ctx.imports.length > 0) {
    lines.push("\n## context");

    if (ctx.exports.length > 0) {
      lines.push(`exports: ${ctx.exports.join(", ")}`);
    }

    if (ctx.imports.length > 0) {
      const importStrs = ctx.imports.map((imp) => {
        return `${imp.path} (${imp.symbols.join(", ")})`;
      });
      lines.push(`imports: ${importStrs.join(", ")}`);
    }
  }

  return lines.join("\n");
}
