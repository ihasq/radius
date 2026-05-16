/**
 * vscode-languageclient モジュールシム。
 *
 * 拡張が require("vscode-languageclient") または require("vscode-languageclient/node")
 * した際に返されるオブジェクト。LanguageClient のコンストラクタを傍受し、
 * ServerOptions を捕捉する。
 */

import type { Disposable } from "./vscode";

// ========================================
// 型定義
// ========================================

export enum TransportKind {
  stdio = 0,
  ipc = 1,
  pipe = 2,
  socket = 3,
}

export interface Executable {
  command: string;
  args?: string[];
  options?: {
    cwd?: string;
    env?: Record<string, string>;
  };
}

export interface NodeModule {
  module: string;
  transport?: TransportKind;
  args?: string[];
  runtime?: string;
  options?: {
    cwd?: string;
    env?: Record<string, string>;
  };
}

export interface StreamInfo {
  writer: NodeJS.WritableStream;
  reader: NodeJS.ReadableStream;
}

export type ServerOptions =
  | Executable
  | { run: Executable; debug: Executable }
  | { run: NodeModule; debug: NodeModule }
  | (() => Promise<StreamInfo>);

export interface DocumentSelector {
  language?: string;
  scheme?: string;
  pattern?: string;
}

export interface LanguageClientOptions {
  documentSelector?: DocumentSelector[] | DocumentSelector | string[];
  synchronize?: {
    configurationSection?: string | string[];
    fileEvents?: any;
  };
  diagnosticCollectionName?: string;
  outputChannel?: any;
  outputChannelName?: string;
  revealOutputChannelOn?: number;
  initializationOptions?: any;
  middleware?: any;
  errorHandler?: any;
  workspaceFolder?: any;
  progressOnInitialization?: boolean;
  markdown?: {
    isTrusted?: boolean;
  };
}

/**
 * シムが捕捉したLSPサーバ情報。
 */
export interface CapturedServerInfo {
  /** 拡張ID。 */
  extensionId: string;
  /** LSPサーバの起動コマンド。 */
  command: string;
  /** コマンド引数。 */
  args: string[];
  /** 対象languageIdのリスト（clientOptionsから抽出）。 */
  languageIds: string[];
  /** Nodeモジュールの場合のモジュールパス。 */
  module?: string;
  /** 作業ディレクトリ。 */
  cwd?: string;
  /** 環境変数。 */
  env?: Record<string, string>;
}

/**
 * サーバ捕捉コールバック（ローダから注入される）。
 */
type OnServerCapturedCallback = (info: CapturedServerInfo) => void;

let onServerCapturedCallback: OnServerCapturedCallback | undefined;

/**
 * サーバ捕捉コールバックを設定する（ローダから呼ばれる）。
 */
export function setOnServerCaptured(callback: OnServerCapturedCallback): void {
  onServerCapturedCallback = callback;
}

// ========================================
// LanguageClient シム
// ========================================

export class LanguageClient {
  private id: string;
  private name: string;
  private serverOptions: ServerOptions;
  private clientOptions: LanguageClientOptions;
  private capturedInfo: CapturedServerInfo | null = null;

  /**
   * LanguageClient コンストラクタ。
   *
   * オーバーロード:
   * - LanguageClient(id, name, serverOptions, clientOptions)  // 4引数
   * - LanguageClient(id, serverOptions, clientOptions)         // 3引数
   */
  constructor(
    id: string,
    nameOrServerOptions: string | ServerOptions,
    serverOptionsOrClientOptions: ServerOptions | LanguageClientOptions,
    clientOptions?: LanguageClientOptions
  ) {
    if (typeof nameOrServerOptions === "string") {
      // 4引数形式
      this.id = id;
      this.name = nameOrServerOptions;
      this.serverOptions = serverOptionsOrClientOptions as ServerOptions;
      this.clientOptions = clientOptions || {};
    } else {
      // 3引数形式
      this.id = id;
      this.name = id;
      this.serverOptions = nameOrServerOptions;
      this.clientOptions = serverOptionsOrClientOptions as LanguageClientOptions;
    }

    // ServerOptions を解析
    this.capturedInfo = this.parseServerOptions();
  }

  /**
   * ServerOptions を解析して CapturedServerInfo を生成する。
   */
  private parseServerOptions(): CapturedServerInfo | null {
    let command: string | undefined;
    let args: string[] = [];
    let module: string | undefined;
    let cwd: string | undefined;
    let env: Record<string, string> | undefined;

    if (typeof this.serverOptions === "function") {
      // 形式4: 関数（Phase 6スコープ外）
      console.warn(`[languageclient-shim] Function-based ServerOptions not supported: ${this.id}`);
      return null;
    } else if ("run" in this.serverOptions) {
      // 形式2 or 3: run/debug 分岐
      const runOptions = this.serverOptions.run;
      if ("command" in runOptions) {
        // 形式2: Executable
        command = runOptions.command;
        args = runOptions.args || [];
        cwd = runOptions.options?.cwd;
        env = runOptions.options?.env;
      } else if ("module" in runOptions) {
        // 形式3: NodeModule
        module = runOptions.module;
        args = runOptions.args || [];
        cwd = runOptions.options?.cwd;
        env = runOptions.options?.env;
      }
    } else if ("command" in this.serverOptions) {
      // 形式1: Executable
      command = this.serverOptions.command;
      args = this.serverOptions.args || [];
      cwd = this.serverOptions.options?.cwd;
      env = this.serverOptions.options?.env;
    }

    // languageIds を抽出
    const languageIds = this.extractLanguageIds();

    // module の場合は command を生成（bun または node で実行）
    if (module && !command) {
      command = "bun";
      args = ["run", module, ...args];
    }

    if (!command) {
      console.warn(`[languageclient-shim] Failed to extract command from ServerOptions: ${this.id}`);
      return null;
    }

    return {
      extensionId: this.id,
      command,
      args,
      languageIds,
      module,
      cwd,
      env,
    };
  }

  /**
   * clientOptions.documentSelector から languageId を抽出する。
   */
  private extractLanguageIds(): string[] {
    const languageIds: string[] = [];
    const selector = this.clientOptions.documentSelector;

    if (!selector) {
      return languageIds;
    }

    const selectors = Array.isArray(selector) ? selector : [selector];

    for (const sel of selectors) {
      if (typeof sel === "string") {
        // 文字列直接指定（旧形式）
        languageIds.push(sel);
      } else if (typeof sel === "object" && sel.language) {
        languageIds.push(sel.language);
      }
    }

    return languageIds;
  }

  /**
   * LSPサーバを起動する（シムでは捕捉のみ行い、実際の起動はしない）。
   */
  async start(): Promise<void> {
    if (this.capturedInfo && onServerCapturedCallback) {
      onServerCapturedCallback(this.capturedInfo);
    }
  }

  /**
   * LSPサーバを停止する（no-op）。
   */
  async stop(): Promise<void> {
    // no-op
  }

  /**
   * サーバの準備完了を待つ（互換性のため即座に解決）。
   */
  async onReady(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * サーバにリクエストを送信する（no-op）。
   */
  sendRequest(): Promise<any> {
    return Promise.resolve(null);
  }

  /**
   * サーバに通知を送信する（no-op）。
   */
  sendNotification(): void {
    // no-op
  }

  /**
   * イベントリスナーを登録する（no-op）。
   */
  onNotification(): any {
    return { dispose: () => {} };
  }

  /**
   * リクエストハンドラを登録する（no-op）。
   */
  onRequest(): any {
    return { dispose: () => {} };
  }
}

// ========================================
// エクスポート
// ========================================

// 名前付きエクスポートのみ（CommonJS interop のため default を削除）
