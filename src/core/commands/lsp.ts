/**
 * lsp コマンドハンドラ。
 *
 * LSPサーバの一覧表示。
 */

import type { IpcResponse } from "../../shared/types";
import type { ExtensionLoader } from "../../extension-host/loader";

/**
 * lsp list コマンドのハンドラ。
 */
export async function handleLspList(
  _args: Record<string, unknown>,
  extensionLoader: ExtensionLoader
): Promise<IpcResponse> {
  const servers = extensionLoader.listAllServers();

  if (servers.length === 0) {
    return { ok: true, data: "No LSP servers registered." };
  }

  // ヘッダー
  const lines = [
    "language".padEnd(20) + "command".padEnd(40) + "source",
    "-".repeat(80),
  ];

  // 各サーバ
  for (const server of servers) {
    const langCol = server.languageId.padEnd(20);
    const cmdCol = `${server.command} ${server.args.join(" ")}`.padEnd(40);
    let sourceCol: string = server.source;
    if (server.source === "extension" && server.extensionId) {
      sourceCol = `extension (${server.extensionId})`;
    } else if (server.source === "user-config") {
      sourceCol = "user-config (~/.radius/lsp-servers.json)";
    }

    lines.push(`${langCol}${cmdCol}${sourceCol}`);
  }

  return { ok: true, data: lines.join("\n") };
}
