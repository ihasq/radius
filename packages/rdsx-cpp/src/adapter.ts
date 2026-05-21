/**
 * C++ Language Support via clangd
 * Placeholder implementation - returns empty/null for all methods
 */

import type {
  RdsxAnalyzer,
  TextEdit,
  HoverResult,
  Reference,
  FileEdit,
  Diagnostic,
  CodeFix,
} from "../../rdsx-ts/src/interface";
import type { RadSymbol } from "../../rdsx-ts/src/index";

export class CppRdsxAnalyzer implements RdsxAnalyzer {
  readonly kind = "analyzer" as const;
  readonly name = "@radius/rdsx-cpp";
  readonly version = "0.0.1";
  readonly languageIds = ["c", "cpp"];

  async activate(): Promise<void> {
    // Check if clangd is available
    const { execSync } = require("child_process");
    try {
      execSync("which clangd", { stdio: "ignore" });
    } catch {
      throw new Error("clangd not installed");
    }
  }

  async deactivate(): Promise<void> {
    // No-op for placeholder
  }

  async getSymbols(_filePath: string, _content: string): Promise<RadSymbol[]> {
    return [];
  }

  async format(_filePath: string, _content: string): Promise<TextEdit[]> {
    return [];
  }

  async getHoverInfo(
    _filePath: string,
    _line: number,
    _col: number
  ): Promise<HoverResult | null> {
    return null;
  }

  async findReferences(
    _filePath: string,
    _line: number,
    _col: number
  ): Promise<Reference[]> {
    return [];
  }

  async rename(
    _filePath: string,
    _line: number,
    _col: number,
    _newName: string
  ): Promise<FileEdit[]> {
    return [];
  }

  async getDiagnostics(_filePath: string, _content: string): Promise<Diagnostic[]> {
    return [];
  }

  async getCodeFixes(
    _filePath: string,
    _diagnostic: Diagnostic
  ): Promise<CodeFix[]> {
    return [];
  }
}
