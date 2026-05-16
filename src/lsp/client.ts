/**
 * LSP言語サーバとの通信を行うJSON-RPCクライアント。
 * 1プロジェクトルートにつき1インスタンスを生成する。
 */

import type { Subprocess } from "bun";
import { writeMessage, LspReader } from "./transport";
import type { LspLocation, LspPosition, LspDocumentSymbol, LspWorkspaceEdit, LspDiagnostic } from "./types";

interface PendingRequest {
  resolve: (result: any) => void;
  reject: (error: any) => void;
}

export class LspClient {
  private proc: Subprocess<any, "pipe"> | null = null;
  private reader: LspReader | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private alive = false;
  private diagnostics = new Map<string, LspDiagnostic[]>();

  constructor(
    private command: string[],
    private rootUri: string
  ) {}

  /** alive状態を外部から参照するための読み取り専用プロパティ */
  get isAlive(): boolean {
    return this.alive;
  }

  /** 言語サーバを起動し、initializeハンドシェイクを完了する。 */
  async start(): Promise<void> {
    this.proc = Bun.spawn(this.command, {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
    });

    this.reader = new LspReader(this.proc.stdout as ReadableStream<Uint8Array>);
    this.alive = true;

    // 受信ループを開始する（非同期、awaitしない）。
    this.readLoop();

    // initialize リクエスト。
    const initResult = await this.request("initialize", {
      processId: process.pid,
      rootUri: this.rootUri,
      capabilities: {
        textDocument: {
          references: { dynamicRegistration: false },
          documentSymbol: {
            dynamicRegistration: false,
            hierarchicalDocumentSymbolSupport: true,
          },
          rename: { dynamicRegistration: false },
          publishDiagnostics: {
            relatedInformation: true,
            tagSupport: { valueSet: [1, 2] },
            versionSupport: false,
          },
          synchronization: {
            didSave: true,
          },
        },
      },
      workspaceFolders: [{ uri: this.rootUri, name: "root" }],
    });

    // initialized 通知。
    this.notify("initialized", {});

    console.log("[lsp] server initialized");
  }

  /** JSON-RPCリクエストを送信し、レスポンスを待つ。 */
  async request(method: string, params: object): Promise<any> {
    if (!this.proc || !this.alive) throw new Error("LSP not started or dead");
    const id = this.nextId++;

    // A3: writeMessage失敗の捕捉
    try {
      writeMessage(this.proc as any, {
        jsonrpc: "2.0",
        id,
        method,
        params,
      });
    } catch (err) {
      this.alive = false;
      this.pending.delete(id);
      throw new Error(`Failed to write LSP message: ${err instanceof Error ? err.message : String(err)}`);
    }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      // 個別リクエストのタイムアウト: 30秒。
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`LSP request timed out: ${method}`));
        }
      }, 30_000);
    });
  }

  /** JSON-RPC通知を送信する（レスポンスなし）。 */
  notify(method: string, params: object): void {
    if (!this.proc || !this.alive) return;
    try {
      writeMessage(this.proc as any, {
        jsonrpc: "2.0",
        method,
        params,
      });
    } catch {
      this.alive = false;
    }
  }

  /** ドキュメントを開く通知を送信する。 */
  openDocument(uri: string, languageId: string, text: string, version: number = 1): void {
    this.notify("textDocument/didOpen", {
      textDocument: { uri, languageId, version, text },
    });
  }

  /** ドキュメントの変更通知を送信する（診断トリガー用）。 */
  changeDocument(uri: string, text: string, version: number = 2): void {
    this.notify("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
  }

  /** ドキュメントの保存通知を送信する（診断トリガー用）。 */
  saveDocument(uri: string, text?: string): void {
    const params: any = { textDocument: { uri } };
    if (text !== undefined) {
      params.text = text;
    }
    this.notify("textDocument/didSave", params);
  }

  /** ドキュメントを閉じる通知を送信する（A2: LSP状態リセット用）。 */
  closeDocument(uri: string): void {
    this.notify("textDocument/didClose", {
      textDocument: { uri },
    });
  }

  /** ドキュメント内のシンボル一覧を取得する。 */
  async getDocumentSymbols(uri: string): Promise<LspDocumentSymbol[]> {
    return await this.request("textDocument/documentSymbol", {
      textDocument: { uri },
    });
  }

  /** 指定位置の参照箇所を取得する。 */
  async getReferences(
    uri: string,
    position: LspPosition
  ): Promise<LspLocation[]> {
    return await this.request("textDocument/references", {
      textDocument: { uri },
      position,
      context: { includeDeclaration: true },
    });
  }

  /** 指定位置のシンボルをリネームする。 */
  async rename(
    uri: string,
    position: LspPosition,
    newName: string
  ): Promise<LspWorkspaceEdit> {
    return await this.request("textDocument/rename", {
      textDocument: { uri },
      position,
      newName,
    });
  }

  /** 指定URIの診断情報を取得する。 */
  getDiagnostics(uri: string): LspDiagnostic[] {
    return this.diagnostics.get(uri) || [];
  }

  /** 診断情報をクリアする（テスト用）。 */
  clearDiagnostics(uri?: string): void {
    if (uri) {
      this.diagnostics.delete(uri);
    } else {
      this.diagnostics.clear();
    }
  }

  /** 言語サーバを停止する。 */
  async shutdown(): Promise<void> {
    if (!this.proc) return;

    // A2: shutdown時のpending全reject
    this.alive = false;
    this.rejectAllPending("LSP client shutting down");

    try {
      await this.request("shutdown", {});
      this.notify("exit", {});
    } catch {
      // タイムアウトしても強制終了する。
    }

    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  /** A1, A2: pending全てをrejectする */
  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pending.entries()) {
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }

  /** 受信ループ。バックグラウンドで動作する。A1: 例外伝搬の実装 */
  private async readLoop(): Promise<void> {
    try {
      while (this.alive && this.reader) {
        try {
          const msg = await this.reader.read();
          if (msg === null) {
            // ストリーム終了
            this.alive = false;
            break;
          }
          this.handleMessage(msg as any);
        } catch (err) {
          console.error("[lsp] readLoop error:", err instanceof Error ? err.message : String(err));
          this.alive = false;
          break;
        }
      }
    } finally {
      // readLoop終了時に全pendingをreject
      if (this.pending.size > 0) {
        this.rejectAllPending("LSP connection lost");
      }
    }
  }

  private handleMessage(msg: {
    id?: number;
    method?: string;
    result?: any;
    error?: any;
    params?: any;
  }): void {
    // レスポンス（idありmethod無し）。
    if (msg.id !== undefined && msg.method === undefined) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(msg.error);
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // 通知（method有りid無し）。
    if (msg.method && msg.id === undefined) {
      this.handleNotification(msg.method, msg.params);
    }
  }

  /** 通知メッセージのハンドリング。 */
  private handleNotification(method: string, params: any): void {
    if (method === "textDocument/publishDiagnostics") {
      const { uri, diagnostics } = params as { uri: string; diagnostics: LspDiagnostic[] };
      this.diagnostics.set(uri, diagnostics || []);
    }
  }
}
