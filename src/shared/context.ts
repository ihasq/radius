/**
 * ファイルコンテキスト生成
 *
 * ファイルの import/export を解析し、## context セクションを生成する。
 */

import { extname } from "node:path";
import * as ts from "typescript";

export interface ExportInfo {
  name: string;
  kind: string; // variable, function, class, interface, type
  typeSignature?: string;
  line: number;
}

export interface FileContext {
  exports: ExportInfo[];
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
 * TypeScript Compiler API を使用して型情報も取得する。
 */
export function analyzeFileContext(filePath: string, content: string): FileContext | null {
  const ext = extname(filePath);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return null;
  }

  const exports: ExportInfo[] = [];
  const imports: ImportInfo[] = [];

  // TypeScript AST を使用して解析
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  function visit(node: ts.Node) {
    // Export 検出
    if (ts.isExportDeclaration(node)) {
      // export { name1, name2 } 形式
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const name = element.name.text;
          const line = sourceFile.getLineAndCharacterOfPosition(element.getStart()).line + 1;
          if (!exports.some(e => e.name === name)) {
            exports.push({ name, kind: "unknown", line });
          }
        }
      }
    } else if (ts.isFunctionDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      // export function name() { }
      if (node.name) {
        const name = node.name.text;
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

        // 戻り値型を取得
        const params = node.parameters.map(p => {
          const paramName = p.name.getText(sourceFile);
          const paramType = p.type ? p.type.getText(sourceFile) : "any";
          return `${paramName}: ${paramType}`;
        }).join(", ");
        const returnType = node.type ? node.type.getText(sourceFile) : "void";
        const typeSignature = `(${params}): ${returnType}`;

        exports.push({ name, kind: "function", typeSignature, line });
      }
    } else if (ts.isVariableStatement(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      // export const/let/var name = value
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const name = decl.name.text;
          const line = sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1;

          // 型注釈を取得
          let typeSignature: string | undefined;
          if (decl.type) {
            typeSignature = decl.type.getText(sourceFile);
          } else if (decl.initializer) {
            // 初期化子から型を推論（簡易版）
            const init = decl.initializer;
            if (ts.isStringLiteral(init)) typeSignature = "string";
            else if (ts.isNumericLiteral(init)) typeSignature = "number";
            else if (init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword) typeSignature = "boolean";
          }

          exports.push({ name, kind: "variable", typeSignature, line });
        }
      }
    } else if (ts.isClassDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      // export class Name { }
      if (node.name) {
        const name = node.name.text;
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        exports.push({ name, kind: "class", line });
      }
    } else if (ts.isInterfaceDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      // export interface Name { }
      const name = node.name.text;
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      exports.push({ name, kind: "interface", line });
    } else if (ts.isTypeAliasDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      // export type Name = ...
      const name = node.name.text;
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const typeSignature = node.type.getText(sourceFile);
      exports.push({ name, kind: "type", typeSignature, line });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

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
      lines.push("exports:");
      for (const exp of ctx.exports) {
        let sig = "";
        if (exp.kind === "function" && exp.typeSignature) {
          sig = exp.typeSignature;
        } else if (exp.typeSignature) {
          sig = `: ${exp.typeSignature}`;
        }
        lines.push(`  ${exp.name}${sig} (${exp.kind}, line ${exp.line})`);
      }
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
