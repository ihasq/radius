/**
 * TsgoAdapter - tsgo (TypeScript 7 Go binary) を子プロセスで起動し、
 * JSON-RPC over stdio で通信する LSP クライアント。
 */

import { spawn } from "bun";
import type { Subprocess } from "bun";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * TsgoAdapter - tsgo の LSP プロセスを管理する。
 */
export class TsgoAdapter {
  private proc: Subprocess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, (response: JsonRpcResponse) => void>();
  private buffer = "";
  private rootUri: string;
  private initialized = false;

  constructor(rootUri: string) {
    this.rootUri = rootUri;
  }

  /**
   * tsgo プロセスを起動し、initialize を送信する。
   */
  async start(): Promise<void> {
    if (this.proc) {
      throw new Error("TsgoAdapter already started");
    }

    console.log(`[TsgoAdapter] Starting tsgo with rootUri: ${this.rootUri}`);

    // tsgo --lsp --stdio で起動
    this.proc = spawn(["tsgo", "--lsp", "--stdio"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    console.log(`[TsgoAdapter] tsgo process spawned with PID: ${this.proc.pid}`);

    // stdout からのメッセージ読み取りを開始
    this.startReadLoop();

    // initialize リクエストを送信
    console.log("[TsgoAdapter] Sending initialize request...");
    await this.initialize();
    console.log("[TsgoAdapter] Initialize complete");
  }

  /**
   * initialize リクエストを送信する。
   */
  private async initialize(): Promise<void> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Initialize timeout (10s)")), 10000)
    );

    const response = await Promise.race([
      this.sendRequest("initialize", {
        processId: process.pid,
        rootUri: this.rootUri,
        capabilities: {},
      }),
      timeout
    ]);

    if (response.error) {
      throw new Error(`Initialize failed: ${response.error.message}`);
    }

    // initialized notification を送信
    await this.sendNotification("initialized", {});
    this.initialized = true;
  }

  /**
   * JSON-RPC リクエストを送信し、応答を待つ。
   */
  async sendRequest(method: string, params: any): Promise<JsonRpcResponse> {
    if (!this.proc || !this.proc.stdin) {
      throw new Error("TsgoAdapter not started");
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const body = JSON.stringify(request);
    const message = `Content-Length: ${body.length}\r\n\r\n${body}`;

    console.log(`[TsgoAdapter] Sending request ${id}: ${method}`);

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout (30s): ${method}`));
      }, 30000)
    );

    const responsePromise = new Promise<JsonRpcResponse>((resolve, reject) => {
      this.pendingRequests.set(id, (response) => {
        if (response.error) {
          reject(new Error(`RPC error: ${response.error.message}`));
        } else {
          resolve(response);
        }
      });
      (this.proc!.stdin as any).write(message);
      console.log(`[TsgoAdapter] Request ${id} sent, waiting for response...`);
    });

    return Promise.race([responsePromise, timeout]);
  }

  /**
   * JSON-RPC notification を送信する（応答なし）。
   */
  async sendNotification(method: string, params: any): Promise<void> {
    if (!this.proc || !this.proc.stdin) {
      throw new Error("TsgoAdapter not started");
    }

    const notification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    const body = JSON.stringify(notification);
    const message = `Content-Length: ${body.length}\r\n\r\n${body}`;
    (this.proc.stdin as any).write(message);
  }

  /**
   * stdout からメッセージを読み取るループ。
   */
  private async startReadLoop(): Promise<void> {
    if (!this.proc || !this.proc.stdout) {
      console.log("[TsgoAdapter] startReadLoop: no proc or stdout");
      return;
    }

    console.log("[TsgoAdapter] startReadLoop: starting...");
    const decoder = new TextDecoder();
    const reader = this.proc.stdout;

    try {
      for await (const chunk of reader as any) {
        const text = decoder.decode(chunk);
        console.log(`[TsgoAdapter] Received ${text.length} bytes`);
        this.buffer += text;
        this.processBuffer();
      }
      console.log("[TsgoAdapter] startReadLoop: ended normally");
    } catch (err) {
      // プロセス終了時のエラーは無視
      console.log("[TsgoAdapter] startReadLoop: error", err);
    }
  }

  /**
   * バッファから完全なメッセージを抽出して処理する。
   */
  private processBuffer(): void {
    while (true) {
      // Content-Length ヘッダを探す
      const headerMatch = this.buffer.match(/Content-Length: (\d+)\r\n\r\n/);
      if (!headerMatch) {
        break;
      }

      const contentLength = parseInt(headerMatch[1], 10);
      const headerEnd = headerMatch.index! + headerMatch[0].length;
      const messageEnd = headerEnd + contentLength;

      if (this.buffer.length < messageEnd) {
        // まだメッセージ全体が届いていない
        break;
      }

      const body = this.buffer.slice(headerEnd, messageEnd);
      this.buffer = this.buffer.slice(messageEnd);

      try {
        const message = JSON.parse(body);
        this.handleMessage(message);
      } catch (err) {
        console.error("Failed to parse JSON-RPC message:", err);
      }
    }
  }

  /**
   * 受信したメッセージを処理する。
   */
  private handleMessage(message: any): void {
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      // リクエストの応答
      const resolve = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      resolve(message);
    } else if (message.method) {
      // notification (window/logMessage 等)
      // 現在は無視
    }
  }

  /**
   * tsgo プロセスを停止する。
   */
  async stop(): Promise<void> {
    if (!this.proc) {
      return;
    }

    try {
      // shutdown リクエストを送信
      await this.sendRequest("shutdown", null);

      // exit notification を送信
      await this.sendNotification("exit", null);
    } catch {
      // エラーは無視
    }

    // プロセスを強制終了
    this.proc.kill();
    await this.proc.exited;
    this.proc = null;
    this.initialized = false;
  }

  /**
   * 初期化済みかどうか。
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
