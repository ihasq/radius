/**
 * TsRad - TypeScript Radius (In-process Language Service)
 *
 * depth-1: 構文解析のみ (AST-based, no type checking)
 * depth-2: 直接import解決
 * depth-3: プロジェクト全体参照
 * depth-4: フルセマンティック解析
 */

import ts from "typescript";
import { appendFileSync } from "node:fs";

export interface RadSymbol {
  name: string;
  kind: string;
  line: number;
  exported: boolean;
  typeSignature?: string; // 関数の戻り値型、変数の型注釈
  uses?: string[]; // このシンボルが使用している他のシンボル名
  children?: RadSymbol[];
}

export interface ImportInfo {
  moduleSpecifier: string;
  namedImports: string[];
  defaultImport?: string;
  namespaceImport?: string;
}

export class TsRad {
  /**
   * depth-1: 単一ファイルの構文解析。
   * node_modules を走査しない。外部プロセスを起動しない。
   */
  parseFile(filePath: string, content: string): ts.SourceFile {
    return ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true // setParentNodes: シンボルツリー走査に必要
    );
  }

  /**
   * SourceFile から DocumentSymbol 互換のシンボルツリーを抽出する。
   */
  getSymbols(sourceFile: ts.SourceFile): RadSymbol[] {
    const symbols: RadSymbol[] = [];

    // デバッグログ: ファイル情報
    try {
      appendFileSync("/tmp/tsrad-debug.log", `[getSymbols] fileName=${sourceFile.fileName} textLen=${sourceFile.text.length}\n`);
    } catch {}

    const visit = (node: ts.Node): void => {
      const symbol = this.nodeToSymbol(node, sourceFile);
      if (symbol) {
        symbols.push(symbol);
        // デバッグログ: シンボル検出
        try {
          appendFileSync("/tmp/tsrad-debug.log", `[symbol] ${symbol.kind} ${symbol.name}\n`);
        } catch {}
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // デバッグログ: 総数
    try {
      appendFileSync("/tmp/tsrad-debug.log", `[total] symbols=${symbols.length}\n`);
    } catch {}

    return symbols;
  }

  /**
   * ノードをRadSymbolに変換する。
   */
  private nodeToSymbol(node: ts.Node, sourceFile: ts.SourceFile): RadSymbol | null {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    if (ts.isFunctionDeclaration(node) && node.name) {
      // 戻り値型を取得
      const returnType = node.type ? node.type.getText(sourceFile) : "void";
      const params = node.parameters.map(p => {
        const paramName = p.name.getText(sourceFile);
        const paramType = p.type ? p.type.getText(sourceFile) : "any";
        return `${paramName}: ${paramType}`;
      }).join(", ");
      const typeSignature = `(${params}): ${returnType}`;

      // 依存関係を抽出
      const uses: string[] = [];
      const allExportNames: string[] = [];
      // 先にすべてのexport名を収集（簡易版: sourceFile全体を走査）
      ts.forEachChild(sourceFile, child => {
        if (ts.isFunctionDeclaration(child) && child.name && this.hasExportModifier(child)) {
          allExportNames.push(child.name.text);
        } else if (ts.isVariableStatement(child) && this.hasExportModifier(child)) {
          child.declarationList.declarations.forEach(decl => {
            if (ts.isIdentifier(decl.name)) {
              allExportNames.push(decl.name.text);
            }
          });
        }
      });

      // 関数ボディ内のIdentifierを走査
      const visitBody = (n: ts.Node) => {
        if (ts.isIdentifier(n)) {
          const text = n.text;
          if (allExportNames.includes(text) && text !== node.name!.text && !uses.includes(text)) {
            uses.push(text);
          }
        }
        ts.forEachChild(n, visitBody);
      };
      if (node.body) {
        visitBody(node.body);
      }

      return {
        name: node.name.text,
        kind: "function",
        line,
        exported: this.hasExportModifier(node),
        typeSignature,
        uses: uses.length > 0 ? uses : undefined,
      };
    }

    if (ts.isClassDeclaration(node) && node.name) {
      const children: RadSymbol[] = [];
      node.members.forEach(member => {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
          children.push({
            name: member.name.text,
            kind: "method",
            line: sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1,
            exported: false,
          });
        } else if (ts.isPropertyDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
          children.push({
            name: member.name.text,
            kind: "property",
            line: sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1,
            exported: false,
          });
        }
      });

      return {
        name: node.name.text,
        kind: "class",
        line,
        exported: this.hasExportModifier(node),
        children,
      };
    }

    if (ts.isVariableStatement(node)) {
      const declaration = node.declarationList.declarations[0];
      if (declaration && ts.isIdentifier(declaration.name)) {
        // 型注釈を取得
        let typeSignature: string | undefined;
        if (declaration.type) {
          typeSignature = declaration.type.getText(sourceFile);
        } else if (declaration.initializer) {
          // 初期化子から型を推論（簡易版）
          if (ts.isStringLiteral(declaration.initializer)) typeSignature = "string";
          else if (ts.isNumericLiteral(declaration.initializer)) typeSignature = "number";
          else if (declaration.initializer.kind === ts.SyntaxKind.TrueKeyword || declaration.initializer.kind === ts.SyntaxKind.FalseKeyword) {
            typeSignature = "boolean";
          }
        }

        return {
          name: declaration.name.text,
          kind: declaration.type ? "variable" : "const",
          line,
          exported: this.hasExportModifier(node),
          typeSignature,
        };
      }
    }

    if (ts.isInterfaceDeclaration(node)) {
      return {
        name: node.name.text,
        kind: "interface",
        line,
        exported: this.hasExportModifier(node),
      };
    }

    if (ts.isTypeAliasDeclaration(node)) {
      return {
        name: node.name.text,
        kind: "type",
        line,
        exported: this.hasExportModifier(node),
      };
    }

    if (ts.isEnumDeclaration(node)) {
      return {
        name: node.name.text,
        kind: "enum",
        line,
        exported: this.hasExportModifier(node),
      };
    }

    return null;
  }

  /**
   * ノードがexportキーワードを持つか判定する。
   */
  private hasExportModifier(node: ts.Node): boolean {
    if (!ts.canHaveModifiers(node)) return false;
    const modifiers = ts.getModifiers(node);
    return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  }

  /**
   * SourceFile から export されているシンボル名一覧を抽出する。
   */
  getExports(sourceFile: ts.SourceFile): string[] {
    const exports: string[] = [];

    const visit = (node: ts.Node): void => {
      if (this.hasExportModifier(node)) {
        const name = this.getNodeName(node);
        if (name) exports.push(name);
      }

      // export { foo, bar }
      if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
        node.exportClause.elements.forEach(el => {
          exports.push(el.name.text);
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return exports;
  }

  /**
   * ノードから名前を取得する。
   */
  private getNodeName(node: ts.Node): string | null {
    if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
    if (ts.isClassDeclaration(node) && node.name) return node.name.text;
    if (ts.isInterfaceDeclaration(node)) return node.name.text;
    if (ts.isTypeAliasDeclaration(node)) return node.name.text;
    if (ts.isEnumDeclaration(node)) return node.name.text;
    if (ts.isVariableStatement(node)) {
      const decl = node.declarationList.declarations[0];
      if (decl && ts.isIdentifier(decl.name)) return decl.name.text;
    }
    return null;
  }

  /**
   * SourceFile から import 情報を抽出する。
   */
  getImports(sourceFile: ts.SourceFile): ImportInfo[] {
    const imports: ImportInfo[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
        const namedImports: string[] = [];
        let defaultImport: string | undefined;
        let namespaceImport: string | undefined;

        if (node.importClause) {
          // default import: import Foo from "..."
          if (node.importClause.name) {
            defaultImport = node.importClause.name.text;
          }

          // named imports: import { a, b } from "..."
          if (node.importClause.namedBindings) {
            if (ts.isNamedImports(node.importClause.namedBindings)) {
              node.importClause.namedBindings.elements.forEach(el => {
                namedImports.push(el.name.text);
              });
            }

            // namespace import: import * as Foo from "..."
            if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              namespaceImport = node.importClause.namedBindings.name.text;
            }
          }
        }

        imports.push({
          moduleSpecifier,
          namedImports,
          defaultImport,
          namespaceImport,
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return imports;
  }
}
