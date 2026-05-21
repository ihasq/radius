/**
 * TsRadProvider - TypeScript 用の RdsxAnalyzer 実装
 *
 * 既存の TsRad クラスをラップして RdsxAnalyzer インタフェースを実装する。
 */

import type {
  RdsxAnalyzer,
  TextEdit,
  HoverResult,
  Reference,
  FileEdit,
  Diagnostic,
  CodeFix,
} from "./interface";
import type { RadSymbol } from "./index";
import { TsRad } from "./index";

/**
 * TsRadProvider - in-process TypeScript Language Service
 */
export class TsRadProvider implements RdsxAnalyzer {
  readonly kind = "analyzer" as const;
  readonly name = "@radius/rdsx-ts";
  readonly version = "1.0.0";
  readonly languageIds = ["typescript", "typescriptreact"];

  private tsRad: TsRad;

  constructor() {
    this.tsRad = new TsRad();
  }

  async activate(): Promise<void> {
    // In-process analyzer, no activation needed
  }

  async deactivate(): Promise<void> {
    // TsRad is stateless, no cleanup needed
  }

  async getSymbols(filePath: string, content: string): Promise<RadSymbol[]> {
    const sourceFile = this.tsRad.parseFile(filePath, content);
    return this.tsRad.getSymbols(sourceFile);
  }

  async format(filePath: string, content: string): Promise<TextEdit[]> {
    // TODO: Phase 2 では未実装、空配列を返す
    return [];
  }

  async getHoverInfo(filePath: string, line: number, col: number): Promise<HoverResult | null> {
    // TODO: Phase 2 では未実装
    return null;
  }

  async findReferences(filePath: string, line: number, col: number): Promise<Reference[]> {
    // TODO: Phase 2 では未実装
    return [];
  }

  async rename(filePath: string, line: number, col: number, newName: string): Promise<FileEdit[]> {
    // TODO: Phase 2 では未実装
    return [];
  }

  async getDiagnostics(filePath: string, content: string): Promise<Diagnostic[]> {
    // TODO: Phase 2 では未実装
    return [];
  }

  async getCodeFixes(filePath: string, diagnostic: Diagnostic): Promise<CodeFix[]> {
    // TODO: Phase 2 では未実装
    return [];
  }
}
