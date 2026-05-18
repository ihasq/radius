/**
 * File Context Analysis
 *
 * TypeScript/JavaScript ファイルの exports と imports を軽量解析する。
 */

export interface FileContext {
  exports: string[];
  imports: ImportInfo[];
}

export interface ImportInfo {
  from: string;
  symbols: string[];
}

/**
 * ファイルの exports と imports を解析して FileContext を返す。
 * TypeScript / JavaScript のみ対応。非対応ファイルは null。
 */
export function analyzeFileContext(filePath: string, content: string): FileContext | null {
  // TypeScript/JavaScript 以外は null
  if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath)) {
    return null;
  }

  const exports: string[] = [];
  const imports: ImportInfo[] = [];

  // Export 検出
  // export const/let/var/function/class/interface/type/enum NAME
  const exportDeclMatch = content.matchAll(/export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g);
  for (const match of exportDeclMatch) {
    exports.push(match[1]);
  }

  // export default
  const exportDefaultMatch = content.matchAll(/export\s+default\s+(?:function|class)?\s*(\w+)?/g);
  for (const match of exportDefaultMatch) {
    if (match[1]) {
      exports.push(match[1]);
    } else {
      exports.push("default");
    }
  }

  // export { ... }
  const exportListMatch = content.matchAll(/export\s*\{([^}]+)\}/g);
  for (const match of exportListMatch) {
    const names = match[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0].trim());
    exports.push(...names);
  }

  // Import 検出
  // import { ... } from "..."
  const importNamedMatch = content.matchAll(/import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g);
  for (const match of importNamedMatch) {
    const symbols = match[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0].trim());
    imports.push({ from: match[2], symbols });
  }

  // import NAME from "..."
  const importDefaultMatch = content.matchAll(/import\s+(\w+)\s+from\s+["']([^"']+)["']/g);
  for (const match of importDefaultMatch) {
    imports.push({ from: match[2], symbols: [match[1]] });
  }

  // import * as NAME from "..."
  const importNamespaceMatch = content.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["']/g);
  for (const match of importNamespaceMatch) {
    imports.push({ from: match[2], symbols: [`* as ${match[1]}`] });
  }

  return { exports, imports };
}

/**
 * FileContext を付帯テキストにフォーマットする。
 */
export function formatFileContext(ctx: FileContext): string {
  const MAX_ITEMS = 10;

  let exportsStr = "";
  if (ctx.exports.length === 0) {
    exportsStr = "none";
  } else if (ctx.exports.length <= MAX_ITEMS) {
    exportsStr = ctx.exports.join(", ");
  } else {
    exportsStr = ctx.exports.slice(0, MAX_ITEMS).join(", ") + ` ... and ${ctx.exports.length - MAX_ITEMS} more`;
  }

  let importsStr = "";
  if (ctx.imports.length === 0) {
    importsStr = "none";
  } else if (ctx.imports.length <= MAX_ITEMS) {
    importsStr = ctx.imports.map(imp => `${imp.from} (${imp.symbols.join(", ")})`).join(", ");
  } else {
    const displayed = ctx.imports.slice(0, MAX_ITEMS).map(imp => `${imp.from} (${imp.symbols.join(", ")})`).join(", ");
    importsStr = displayed + ` ... and ${ctx.imports.length - MAX_ITEMS} more`;
  }

  return `\n## context\nexports: ${exportsStr}\nimports: ${importsStr}`;
}
