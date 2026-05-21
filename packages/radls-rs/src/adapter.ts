/**
 * Rust Language Support via rust-analyzer
 */

import type { RadlsProvider, HoverResult, Reference, Diagnostic, FileEdit } from "@radius/radls-ts/interface";
import type { RadSymbol } from "@radius/radls-ts";

export class RustAdapter implements RadlsProvider {
  private process: any = null;
  private rootUri: string;

  constructor(rootUri: string) {
    this.rootUri = rootUri;
  }

  async getSymbols(filePath: string, _content: string): Promise<RadSymbol[]> {
    // Stub: rust-analyzer would provide document symbols
    return [];
  }

  async format(_filePath: string, _content: string): Promise<any[]> {
    // Stub: rust-analyzer formatting
    return [];
  }

  async getHoverInfo(_filePath: string, _line: number, _col: number): Promise<HoverResult | null> {
    // Stub: rust-analyzer hover
    return null;
  }

  async findReferences(_filePath: string, _line: number, _col: number): Promise<Reference[]> {
    // Stub: rust-analyzer references
    return [];
  }

  async rename(_filePath: string, _line: number, _col: number, _newName: string): Promise<FileEdit[]> {
    // Stub: rust-analyzer rename
    return [];
  }

  async getDiagnostics(_filePath: string): Promise<Diagnostic[]> {
    // Stub: rust-analyzer diagnostics
    return [];
  }

  async getCodeFixes(_filePath: string, _diagnostic: Diagnostic): Promise<any[]> {
    // Stub: rust-analyzer code actions
    return [];
  }

  async shutdown(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  async dispose(): Promise<void> {
    await this.shutdown();
  }
}
