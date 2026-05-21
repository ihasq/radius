/**
 * RDSX (Radius Extension) Type Definitions
 *
 * Unified extension system for all Radius extensions:
 * - analyzers (language services)
 * - commands (editor actions)
 * - debuggers (DAP)
 * - tools (formatters, linters)
 */

import type { RadSymbol } from "../../packages/rdsx-ts/src/index";
import type {
  TextEdit,
  HoverResult,
  Reference,
  FileEdit,
  Diagnostic,
  CodeFix,
} from "../../packages/rdsx-ts/src/interface";

/**
 * Extension kind discriminator
 */
export type RdsxKind = "analyzer" | "command" | "debugger" | "tool";

/**
 * Base extension interface - all RDSX extensions implement this
 */
export interface RdsxExtension {
  readonly kind: RdsxKind;
  readonly name: string;
  readonly version: string;
  activate(): Promise<void>;
  deactivate(): Promise<void>;
}

/**
 * RdsxAnalyzer - language service extension
 * Supersedes the previous RadlsProvider interface with unified extension model
 */
export interface RdsxAnalyzer extends RdsxExtension {
  readonly kind: "analyzer";
  readonly languageIds: string[];

  /**
   * depth-1: Get symbols from file
   */
  getSymbols(filePath: string, content: string): Promise<RadSymbol[]>;

  /**
   * depth-2: Format file
   */
  format(filePath: string, content: string): Promise<TextEdit[]>;

  /**
   * depth-2: Get hover information at position
   */
  getHoverInfo(
    filePath: string,
    line: number,
    col: number
  ): Promise<HoverResult | null>;

  /**
   * depth-3: Find references to symbol at position
   */
  findReferences(
    filePath: string,
    line: number,
    col: number
  ): Promise<Reference[]>;

  /**
   * depth-3: Rename symbol at position
   */
  rename(
    filePath: string,
    line: number,
    col: number,
    newName: string
  ): Promise<FileEdit[]>;

  /**
   * depth-3: Get diagnostics for file
   */
  getDiagnostics(filePath: string, content: string): Promise<Diagnostic[]>;

  /**
   * depth-4: Get code fixes for diagnostic
   */
  getCodeFixes(
    filePath: string,
    diagnostic: Diagnostic
  ): Promise<CodeFix[]>;
}

/**
 * RdsxCommand - editor command extension
 */
export interface RdsxCommand extends RdsxExtension {
  readonly kind: "command";
  readonly commandId: string;
  execute(args: Record<string, unknown>): Promise<unknown>;
}

/**
 * RdsxDebugger - DAP debugger extension
 */
export interface RdsxDebugger extends RdsxExtension {
  readonly kind: "debugger";
  readonly debugTypes: string[];
  startSession(config: unknown): Promise<void>;
}

/**
 * RdsxTool - standalone tool extension (formatters, linters)
 */
export interface RdsxTool extends RdsxExtension {
  readonly kind: "tool";
  execute(filePath: string, content: string): Promise<string>;
}
