/**
 * Phase 16: accept-change コマンド
 * Hotfix: タグチェーンベースのエージェント識別
 *
 * コンフリクトを受け入れる。
 */

import type { IpcRequest, IpcResponse } from "../../shared/types";
import type { DaemonContext } from "../../daemon/registry";
import { findProjectRoot } from "../../shared/project";
import { errorResponse } from "../../shared/output";

export async function handleAcceptChange(
  request: IpcRequest,
  ctx: DaemonContext
): Promise<IpcResponse> {
  const { args, cwd } = request;

  const conflictId = args.conflict as string | undefined;

  // 引数検証
  if (!conflictId) {
    return errorResponse("missing argument: --conflict <conflict-id>");
  }

  // プロジェクトルートとチェーンIDを取得
  const projectRoot = findProjectRoot(cwd || process.cwd());
  const chainId = (request as any).chainId as string;

  const conflictManager = ctx.getConflictManager(projectRoot);

  // accept 実行
  try {
    const conflict = await conflictManager.acceptConflict(conflictId, chainId);

    if (!conflict) {
      return errorResponse(`conflict not found: ${conflictId}`);
    }

    // 通知をクリア
    await conflictManager.clearNotifications(chainId);

    const lines: string[] = [];
    lines.push(`conflict ${conflictId} accepted by chain ${chainId}`);
    lines.push("");
    lines.push(`file: ${conflict.filePath}`);
    lines.push(`lines: ${conflict.overlapStartLine}-${conflict.overlapEndLine}`);
    lines.push(`initiator: ${conflict.initiator.chainId}`);
    lines.push(`reason: ${conflict.initiator.reason}`);
    lines.push("");
    lines.push("status: resolved");

    return {
      ok: true,
      data: lines.join("\n"),
    };
  } catch (err) {
    return errorResponse((err as Error).message);
  }
}
