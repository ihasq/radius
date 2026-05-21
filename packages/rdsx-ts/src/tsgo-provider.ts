/**
 * TsgoProvider - tsgo (TypeScript 7 Go binary) を使用した RadlsProvider 実装
 *
 * TsgoAdapter を経由して JSON-RPC で通信し、LSP プロトコルで言語機能を提供する。
 */

import { TsgoAdapter } from "./tsgo-adapter";
import type {
  RadlsProvider,
  TextEdit,
  HoverResult,
  Reference,
  FileEdit,
  Diagnostic,
  CodeFix,
} from "./interface";

// RadSymbol type (avoiding circular import with index.ts)
interface RadSymbol {
  name: string;
  kind: string;
  line: number;
  exported: boolean;
  typeSignature?: string;
  uses?: string[];
  children?: RadSymbol[];
}

/**
 * TsgoProvider - tsgo 子プロセスを使用した Language Service
 */
export class TsgoProvider implements RadlsProvider {
  private adapter: TsgoAdapter;
  private openDocuments = new Map<string, number>(); // uri -> version
  private startPromise: Promise<void> | null = null;

  constructor(rootUri: string) {
    this.adapter = new TsgoAdapter(rootUri);
  }

  /**
   * tsgo プロセスを起動する
   */
  async start(): Promise<void> {
    await this.adapter.start();
  }

  /**
   * 遅延初期化: 最初のメソッド呼び出し時に自動的に start() を呼ぶ
   */
  private async ensureStarted(): Promise<void> {
    if (this.adapter.isInitialized()) {
      return;
    }
    if (!this.startPromise) {
      this.startPromise = this.start();
    }
    await this.startPromise;
  }

  /**
   * ドキュメントを開く（内部管理）
   */
  private async ensureDocumentOpen(uri: string, content: string, languageId = "typescript"): Promise<void> {
    await this.ensureStarted();
    if (!this.openDocuments.has(uri)) {
      await this.adapter.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId,
          version: 1,
          text: content,
        },
      });
      this.openDocuments.set(uri, 1);
    } else {
      // 既に開いている場合は変更通知
      const version = this.openDocuments.get(uri)! + 1;
      this.openDocuments.set(uri, version);
      await this.adapter.sendNotification("textDocument/didChange", {
        textDocument: { uri, version },
        contentChanges: [{ text: content }],
      });
    }
  }

  /**
   * depth-1: シンボル一覧を取得
   */
  async getSymbols(filePath: string, content: string): Promise<RadSymbol[]> {
    const uri = `file://${filePath}`;
    await this.ensureDocumentOpen(uri, content);

    const response = await this.adapter.sendRequest("textDocument/documentSymbol", {
      textDocument: { uri },
    });

    if (response.error) {
      console.error(`getSymbols failed: ${response.error.message}`);
      return [];
    }

    if (!response.result || !Array.isArray(response.result)) {
      return [];
    }

    // LSP DocumentSymbol を RadSymbol に変換
    return this.convertLspSymbols(response.result);
  }

  /**
   * LSP DocumentSymbol を RadSymbol に変換
   */
  private convertLspSymbols(lspSymbols: any[]): RadSymbol[] {
    const result: RadSymbol[] = [];

    for (const sym of lspSymbols) {
      const radSymbol: RadSymbol = {
        name: sym.name,
        kind: this.mapSymbolKind(sym.kind),
        line: sym.range.start.line + 1, // LSP は 0-indexed、RadSymbol は 1-indexed
        exported: false, // TODO: LSP から export 判定を取得
        uses: [], // depth-1 では uses は未対応
        children: sym.children ? this.convertLspSymbols(sym.children) : undefined,
      };

      result.push(radSymbol);
    }

    return result;
  }

  /**
   * LSP SymbolKind を RadSymbol の kind にマッピング
   */
  private mapSymbolKind(lspKind: number): string {
    const kindMap: Record<number, string> = {
      1: "file",
      2: "module",
      3: "namespace",
      4: "package",
      5: "class",
      6: "method",
      7: "property",
      8: "field",
      9: "constructor",
      10: "enum",
      11: "interface",
      12: "function",
      13: "variable",
      14: "constant",
      15: "string",
      16: "number",
      17: "boolean",
      18: "array",
      19: "object",
      20: "key",
      21: "null",
      22: "enummember",
      23: "struct",
      24: "event",
      25: "operator",
      26: "typeparameter",
    };

    return kindMap[lspKind] || "unknown";
  }

  /**
   * depth-2: フォーマット
   */
  async format(filePath: string, content: string): Promise<TextEdit[]> {
    const uri = `file://${filePath}`;
    await this.ensureDocumentOpen(uri, content);

    const response = await this.adapter.sendRequest("textDocument/formatting", {
      textDocument: { uri },
      options: {
        tabSize: 2,
        insertSpaces: true,
      },
    });

    if (response.error || !response.result) {
      return [];
    }

    return response.result as TextEdit[];
  }

  /**
   * depth-2: ホバー情報を取得
   */
  async getHoverInfo(filePath: string, line: number, col: number): Promise<HoverResult | null> {
    await this.ensureStarted();
    const uri = `file://${filePath}`;
    // content がないため、ドキュメントが既に開かれていることを前提とする
    // または、ファイルを読み取る必要がある

    const response = await this.adapter.sendRequest("textDocument/hover", {
      textDocument: { uri },
      position: { line: line - 1, character: col - 1 }, // 0-indexed に変換
    });

    if (response.error || !response.result) {
      return null;
    }

    const hover = response.result;
    const content = hover.contents?.value || hover.contents || "";

    return {
      content: typeof content === "string" ? content : JSON.stringify(content),
      range: hover.range,
    };
  }

  /**
   * depth-3: 参照を検索
   */
  async findReferences(filePath: string, line: number, col: number): Promise<Reference[]> {
    await this.ensureStarted();
    const uri = `file://${filePath}`;

    const response = await this.adapter.sendRequest("textDocument/references", {
      textDocument: { uri },
      position: { line: line - 1, character: col - 1 },
      context: { includeDeclaration: true },
    });

    if (response.error || !response.result) {
      return [];
    }

    return response.result.map((ref: any) => ({
      uri: ref.uri,
      range: ref.range,
    }));
  }

  /**
   * depth-3: リネーム
   */
  async rename(filePath: string, line: number, col: number, newName: string): Promise<FileEdit[]> {
    await this.ensureStarted();
    const uri = `file://${filePath}`;

    const response = await this.adapter.sendRequest("textDocument/rename", {
      textDocument: { uri },
      position: { line: line - 1, character: col - 1 },
      newName,
    });

    if (response.error || !response.result) {
      return [];
    }

    const workspaceEdit = response.result;
    const fileEdits: FileEdit[] = [];

    // WorkspaceEdit の changes を FileEdit に変換
    if (workspaceEdit.changes) {
      for (const [docUri, edits] of Object.entries(workspaceEdit.changes)) {
        fileEdits.push({
          filePath: docUri.replace("file://", ""),
          edits: edits as TextEdit[],
        });
      }
    }

    return fileEdits;
  }

  /**
   * depth-3: 診断情報を取得
   */
  async getDiagnostics(filePath: string, content: string): Promise<Diagnostic[]> {
    const uri = `file://${filePath}`;
    await this.ensureDocumentOpen(uri, content);

    // LSP では診断は publishDiagnostics 通知で非同期に送られるか、
    // textDocument/diagnostic リクエストで取得する
    const response = await this.adapter.sendRequest("textDocument/diagnostic", {
      textDocument: { uri },
    });

    if (response.error || !response.result) {
      return [];
    }

    const diagnostics = response.result.items || response.result;

    return diagnostics.map((diag: any) => ({
      severity: this.mapDiagnosticSeverity(diag.severity),
      message: diag.message,
      range: diag.range,
      code: diag.code,
    }));
  }

  /**
   * LSP DiagnosticSeverity を文字列にマッピング
   */
  private mapDiagnosticSeverity(severity: number): "error" | "warning" | "info" | "hint" {
    switch (severity) {
      case 1:
        return "error";
      case 2:
        return "warning";
      case 3:
        return "info";
      case 4:
        return "hint";
      default:
        return "error";
    }
  }

  /**
   * depth-4: コード修正を取得
   */
  async getCodeFixes(filePath: string, diagnostic: Diagnostic): Promise<CodeFix[]> {
    await this.ensureStarted();
    const uri = `file://${filePath}`;

    const response = await this.adapter.sendRequest("textDocument/codeAction", {
      textDocument: { uri },
      range: diagnostic.range,
      context: {
        diagnostics: [
          {
            range: diagnostic.range,
            severity: this.mapSeverityToLsp(diagnostic.severity),
            message: diagnostic.message,
            code: diagnostic.code,
          },
        ],
      },
    });

    if (response.error || !response.result) {
      return [];
    }

    return response.result.map((action: any) => ({
      title: action.title,
      edits: action.edit?.changes?.[uri] || [],
    }));
  }

  /**
   * 文字列 severity を LSP 数値にマッピング
   */
  private mapSeverityToLsp(severity: string): number {
    switch (severity) {
      case "error":
        return 1;
      case "warning":
        return 2;
      case "info":
        return 3;
      case "hint":
        return 4;
      default:
        return 1;
    }
  }

  /**
   * リソースのクリーンアップ
   */
  async dispose(): Promise<void> {
    // 開いているドキュメントを全て閉じる
    for (const uri of this.openDocuments.keys()) {
      await this.adapter.sendNotification("textDocument/didClose", {
        textDocument: { uri },
      });
    }
    this.openDocuments.clear();

    // tsgo プロセスを停止
    await this.adapter.stop();
  }

  /**
   * 初期化済みかどうか
   */
  isInitialized(): boolean {
    return this.adapter.isInitialized();
  }
}
