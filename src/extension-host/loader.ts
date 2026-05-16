/**
 * Extension loader。
 *
 * 拡張からLSPサーバ情報を抽出する。
 * 静的抽出方式: ディレクトリ構造と package.json から情報を取得（activate() 不要）。
 * レガシー方式: バンドルされていない拡張は activate() をフォールバックとして使用。
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, extname, join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionRegistry } from "./registry";
import type { LspManager } from "../lsp/manager";
import type { ResolvedExtension } from "./types";
import type { CapturedServerInfo } from "./shims/languageclient";
import * as vscodeShim from "./shims/vscode";
import * as languageclientShim from "./shims/languageclient";

/**
 * languageId → LSPサーバコマンドのフォールバックテーブル。
 */
const LSP_FALLBACK_TABLE: Record<string, { command: string; args: string[] }> = {
  typescript: { command: "typescript-language-server", args: ["--stdio"] },
  typescriptreact: { command: "typescript-language-server", args: ["--stdio"] },
  javascript: { command: "typescript-language-server", args: ["--stdio"] },
  javascriptreact: { command: "typescript-language-server", args: ["--stdio"] },
  rust: { command: "rust-analyzer", args: [] },
  python: { command: "pylsp", args: [] },
  go: { command: "gopls", args: [] },
  java: { command: "jdtls", args: [] },
  csharp: { command: "omnisharp", args: [] },
};

/**
 * Phase 10 Part C: ユーザ設定のLSPサーバ定義（~/.radius/lsp-servers.json）
 */
let USER_LSP_CONFIG: Record<string, { command: string; args: string[] }> | null = null;
let USER_LSP_CONFIG_LOADED = false;

/**
 * ~/.radius/lsp-servers.json を読み込む。
 */
function loadUserLspConfig(): Record<string, { command: string; args: string[] }> {
  if (USER_LSP_CONFIG_LOADED) {
    return USER_LSP_CONFIG || {};
  }

  USER_LSP_CONFIG_LOADED = true;
  const emptyConfig: Record<string, { command: string; args: string[] }> = {};
  USER_LSP_CONFIG = emptyConfig;
  const configPath = join(homedir(), ".radius", "lsp-servers.json");

  if (!existsSync(configPath)) {
    return USER_LSP_CONFIG;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(content);
    if (parsed.servers && typeof parsed.servers === "object") {
      USER_LSP_CONFIG = parsed.servers;
      console.log(`[extension-host] Loaded user LSP config from ${configPath}`);
    }
  } catch (err) {
    console.warn(`[extension-host] Failed to parse ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return USER_LSP_CONFIG || {};
}

/**
 * 拡張ローダ。
 */
export class ExtensionLoader {
  private capturedServers: Map<string, CapturedServerInfo> = new Map();
  private loadedExtensions: Set<string> = new Set();
  private extensionPaths: Set<string> = new Set();

  constructor(
    private registry: ExtensionRegistry,
    private lspManager: LspManager
  ) {
    // LanguageClient シムにコールバックを設定
    languageclientShim.setOnServerCaptured((info) => {
      this.onServerCaptured(info);
    });
  }

  /**
   * 全拡張をロードし、activate() を呼び出す。
   */
  async loadAll(): Promise<void> {
    const extensions = this.registry.list();
    for (const ext of extensions) {
      try {
        await this.load(ext.id);
      } catch (err) {
        console.error(`[extension-host] Failed to load extension ${ext.id}: ${err}`);
      }
    }
  }

  /**
   * 拡張ディレクトリからLSPサーバの起動情報を静的に抽出する。
   * activate() を実行しない。
   */
  private extractServerInfo(ext: ResolvedExtension): CapturedServerInfo | null {
    const { join } = require("node:path");
    const { readdirSync, statSync } = require("node:fs");

    // 対象言語IDを取得
    const languageIds = Array.from(new Set(ext.fileExtensionMap.values()));
    if (languageIds.length === 0) {
      return null;
    }

    let command: string | null = null;
    let args: string[] = [];

    // 1. 拡張ディレクトリ内の server/ または bin/ を走査
    const serverDirs = ["server", "bin", "out/server", "dist/server"];
    for (const dir of serverDirs) {
      const serverPath = join(ext.extensionPath, dir);
      if (existsSync(serverPath)) {
        try {
          const entries = readdirSync(serverPath);
          for (const entry of entries) {
            const fullPath = join(serverPath, entry);
            try {
              const stat = statSync(fullPath);
              // 実行可能ファイルを検索（拡張子なし、または .exe）
              if (stat.isFile() && (entry.includes("language-server") || entry === "rust-analyzer" || entry.endsWith(".exe"))) {
                command = fullPath;
                console.log(`[extension-host] Found bundled server: ${command}`);
                break;
              }
            } catch {
              // stat失敗は無視
            }
          }
          if (command) break;
        } catch {
          // readdirSync失敗は無視
        }
      }
    }

    // 2. Phase 10 Part C: ユーザ設定を参照
    if (!command) {
      const userConfig = loadUserLspConfig();
      for (const langId of languageIds) {
        const userDef = userConfig[langId];
        if (userDef) {
          command = userDef.command;
          args = userDef.args || [];
          console.log(`[extension-host] Using user-config server for ${langId}: ${command}`);
          break;
        }
      }
    }

    // 3. フォールバックテーブルを参照（全languageIdを試行）
    if (!command) {
      for (const langId of languageIds) {
        const fallback = LSP_FALLBACK_TABLE[langId];
        if (fallback) {
          command = fallback.command;
          args = fallback.args;
          console.log(`[extension-host] Using fallback server for ${langId}: ${command}`);
          break;
        }
      }
    }

    if (!command) {
      console.warn(`[extension-host] No LSP server found for extension ${ext.id}`);
      return null;
    }

    return {
      extensionId: ext.id,
      command,
      args,
      languageIds,
    };
  }

  /**
   * 特定の拡張をロードする。
   * 静的抽出方式: activate() を実行せず、ディレクトリ構造から LSP サーバ情報を抽出する。
   */
  async load(extensionId: string): Promise<void> {
    if (this.loadedExtensions.has(extensionId)) {
      return;
    }

    const ext = this.registry.get(extensionId);
    if (!ext) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    // 静的抽出方式: LSPサーバ情報をディレクトリから抽出
    const serverInfo = this.extractServerInfo(ext);
    if (serverInfo) {
      // 各 languageId に対してサーバ情報を登録
      for (const languageId of serverInfo.languageIds) {
        this.capturedServers.set(languageId, serverInfo);
        console.log(`[extension-host] Registered LSP server for ${languageId}: ${serverInfo.command}`);
      }
      this.loadedExtensions.add(extensionId);
    } else {
      console.warn(`[extension-host] No LSP server info extracted for ${extensionId}`);
    }

    // Phase 10 Part D: 静的抽出失敗時のactivate()フォールバック
    // 非バンドル拡張（開発中・小規模拡張）向け
    if (!serverInfo && ext.entryPoint && existsSync(ext.entryPoint)) {
      console.log(`[loader] trying legacy activate for: ${extensionId}`);
      await this.legacyActivate(ext, extensionId);
    }
  }

  /**
   * レガシー activate() 方式（フォールバック用）。
   */
  private async legacyActivate(ext: ResolvedExtension, extensionId: string): Promise<void> {
    this.extensionPaths.add(ext.extensionPath);
    this.setupModuleInterception(ext);
    const context = vscodeShim.createExtensionContext(ext.extensionPath);

    let extensionModule: any;
    try {
      extensionModule = require(ext.entryPoint!);
    } catch (err) {
      console.error(`[extension-host] Failed to require ${ext.entryPoint}:`, err);
      return;
    }

    if (typeof extensionModule.activate === "function") {
      try {
        await extensionModule.activate(context);
        console.log(`[extension-host] activated (legacy): ${extensionId}`);
        this.loadedExtensions.add(extensionId);
      } catch (err) {
        console.error(`[extension-host] Activation error for ${extensionId}:`, err);
      }
    }
  }

  /**
   * モジュール差し替えを設定する。
   *
   * require("vscode") と require("vscode-languageclient") をシムに差し替える。
   * スコ���プ制御: 拡張ディレクトリからの require のみ差し替える。
   */
  private setupModuleInterception(ext: ResolvedExtension): void {
    const Module = require("module");

    // フックが既に設定済みの場合はスキップ
    if ((Module.prototype.require as any).__radiusHooked) {
      return;
    }

    const originalRequire = Module.prototype.require;
    const self = this;

    Module.prototype.require = function (id: string) {
      // 呼び出し元のファイルパスを取得
      const callerPath = (this as any).filename || (this as any).id;

      // 拡張ディレクトリからの呼び出しかチェック（全拡張パスを確認）
      let isFromExtension = false;
      if (callerPath) {
        for (const extPath of self.extensionPaths) {
          if (callerPath.startsWith(extPath)) {
            isFromExtension = true;
            break;
          }
        }
      }

      if (isFromExtension) {
        // vscode モジュールをシムに差し替え
        if (id === "vscode") {
          return vscodeShim;
        }

        // vscode-languageclient モジュールをシムに差し替え（CommonJS 互換形式）
        if (id === "vscode-languageclient" || id === "vscode-languageclient/node") {
          // ESM namespace ではなく CommonJS module.exports 形式で返す
          return {
            LanguageClient: languageclientShim.LanguageClient,
            TransportKind: languageclientShim.TransportKind,
          };
        }
      }

      // 通常の require
      return originalRequire.apply(this, arguments as any);
    };

    // フック設定済みマーク
    (Module.prototype.require as any).__radiusHooked = true;
  }

  /**
   * LanguageClient シムからサーバ情報を受け取る。
   */
  private onServerCaptured(info: CapturedServerInfo): void {
    console.log(`[extension-host] Captured LSP server: ${info.command} (${info.languageIds.join(", ")})`);

    // 各 languageId に対してサーバ情報を登録
    for (const languageId of info.languageIds) {
      this.capturedServers.set(languageId, info);
    }
  }

  /**
   * ファイルパスから、登録された LSP サーバ情報を返す。
   *
   * LspManager.resolveLspCommand() の代替となる。
   */
  resolveLspServer(filePath: string): CapturedServerInfo | null {
    const ext = extname(filePath);
    const resolvedExt = this.registry.findByFileExtension(ext);

    if (!resolvedExt) {
      return null;
    }

    // 拡張が対応する languageId を取得
    const languageId = resolvedExt.fileExtensionMap.get(ext);
    if (!languageId) {
      return null;
    }

    // languageId から CapturedServerInfo を取得
    return this.capturedServers.get(languageId) || null;
  }

  /**
   * languageId から CapturedServerInfo を取得する。
   */
  getServerByLanguageId(languageId: string): CapturedServerInfo | null {
    return this.capturedServers.get(languageId) || null;
  }

  /**
   * Phase 10 Part C: 全LSPサーバ一覧を返す（ソース情報付き）
   */
  listAllServers(): Array<{
    languageId: string;
    command: string;
    args: string[];
    source: "extension" | "user-config" | "fallback";
    extensionId?: string;
  }> {
    const result: Array<{
      languageId: string;
      command: string;
      args: string[];
      source: "extension" | "user-config" | "fallback";
      extensionId?: string;
    }> = [];

    const seenLanguages = new Set<string>();

    // 1. 拡張から抽出されたサーバ
    for (const [languageId, info] of this.capturedServers.entries()) {
      seenLanguages.add(languageId);
      result.push({
        languageId,
        command: info.command,
        args: info.args,
        source: "extension",
        extensionId: info.extensionId,
      });
    }

    // 2. ユーザ設定
    const userConfig = loadUserLspConfig();
    for (const [languageId, def] of Object.entries(userConfig)) {
      if (!seenLanguages.has(languageId)) {
        seenLanguages.add(languageId);
        result.push({
          languageId,
          command: def.command,
          args: def.args || [],
          source: "user-config",
        });
      }
    }

    // 3. フォールバックテーブル
    for (const [languageId, def] of Object.entries(LSP_FALLBACK_TABLE)) {
      if (!seenLanguages.has(languageId)) {
        seenLanguages.add(languageId);
        result.push({
          languageId,
          command: def.command,
          args: def.args,
          source: "fallback",
        });
      }
    }

    return result;
  }
}
