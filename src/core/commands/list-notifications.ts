/**
 * Phase 16: list-notifications コマンド
 * Hotfix: タグチェーンベースのエージェント識別
 *
 * チェーン宛ての未読通知を表示する。
 */

import type { IpcRequest, IpcResponse } from "../../shared/types";
import type { DaemonContext } from "../../daemon/registry";
import { findProjectRoot } from "../../shared/project";
import { SessionManager } from "../session/manager";

export async function handleListNotifications(
  request: IpcRequest,
  ctx: DaemonContext
): Promise<IpcResponse> {
  const { cwd, tag } = request;

  // プロジェクトルートとチェーンIDを取得
  const projectRoot = findProjectRoot(cwd || process.cwd());
  const chainId = await SessionManager.resolveChainId(projectRoot, tag);

  const conflictManager = ctx.getConflictManager(projectRoot);

  const notifications = await conflictManager.getPendingNotifications(chainId);

  if (notifications.length === 0) {
    return {
      ok: true,
      data: `no pending notifications for chain ${chainId}`,
    };
  }

  const lines: string[] = [];
  lines.push(`pending notifications for chain ${chainId}:`);
  lines.push("");

  for (const notification of notifications) {
    lines.push(`[${notification.type}] ${notification.timestamp}`);
    lines.push(`  conflict: ${notification.conflictId}`);
    lines.push(`  ${notification.message}`);
    lines.push("");
  }

  lines.push(`total: ${notifications.length} notification(s)`);

  return {
    ok: true,
    data: lines.join("\n"),
  };
}
