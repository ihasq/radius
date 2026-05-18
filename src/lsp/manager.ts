/**
 * プロジェクトルート単位でLSPクライアントのライフサイクルを管理する。
 */

import { LspClient } from "./client";
import type { ExtensionLoader } from "../extension-host/loader";

/** ファイル拡張子からLSPサーバの起動コマンドを解決する（フォールバック）。 */
function resolveLspCommandFallback(filePath: string): string[] | null {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
      return ["typescript-language-server", "--stdio"];
    default:
      return null;
  }
}

/** ファイル拡張子からLSPのlanguageIdを解決する。 */
export function resolveLanguageId(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
      return "typescript";
    case "tsx":
      return "typescriptreact";
    case "js":
      return "javascript";
    case "jsx":
      return "javascriptreact";
    default:
      return "plaintext";
  }
}

export class LspManager {
  /** projectRoot → LspClient */
  private clients = new Map<string, LspClient>();
  private extensionLoader: ExtensionLoader | undefined;

  /**
   * ExtensionLoader を設定する（デーモン起動時に呼ばれる）。
   */
  setExtensionLoader(loader: ExtensionLoader): void {
    this.extensionLoader = loader;
  }

  /**
   * ファイル拡張子からLSPサーバの起動コマンドを解決する。
   * ExtensionLoader が設定されていれば拡張から取得し、なければフォールバック。
   */
  private resolveLspCommand(filePath: string): string[] | null {
    // 拡張から解決を試みる
    if (this.extensionLoader) {
      const serverInfo = this.extensionLoader.resolveLspServer(filePath);
      if (serverInfo) {
        return [serverInfo.command, ...serverInfo.args];
      }
    }

    // フォールバック: ハードコードされた設定
    return resolveLspCommandFallback(filePath);
  }

  /**
   * 指定ファイルが属するプロジェクトのLSPクライアントを返す。
   * 未起動の場合は自動的に起動する。
   * LSPが利用不可能な場合はnullを返す。
   */
  async getClient(
    filePath: string,
    projectRoot: string
  ): Promise<LspClient | null> {
    // 既存クライアントがあれば alive 状態を確認
    const existing = this.clients.get(projectRoot);
    if (existing) {
      // A1: クラッシュ済みクライアントの再生成
      if (!existing.isAlive) {
        console.log("[lsp] existing client is dead, regenerating...");
        try {
          await existing.shutdown();
        } catch {
          // shutdown失敗は無視
        }
        this.clients.delete(projectRoot);
        // 新しいクライアントを生成（下の処理に続く）
      } else {
        return existing;
      }
    }

    const command = this.resolveLspCommand(filePath);
    if (!command) return null;

    const rootUri = `file://${projectRoot}`;
    const client = new LspClient(command, rootUri);

    try {
      await client.start();
    } catch (err) {
      console.error(
        "[lsp] failed to start:",
        err instanceof Error ? err.message : String(err)
      );
      return null;
    }

    this.clients.set(projectRoot, client);
    return client;
  }

  /** 全LSPクライアントを停止する。 */
  async stopAll(): Promise<void> {
    const shutdowns = [...this.clients.values()].map((c) => c.shutdown());
    await Promise.allSettled(shutdowns);
    this.clients.clear();
  }
}
