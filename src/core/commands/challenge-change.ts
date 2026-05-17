/**
 * Phase 16: challenge-change コマンド
 * Hotfix: タグチェーンベースのエージェント識別
 *
 * コンフリクトに challenge を送る。
 */

import type { IpcRequest, IpcResponse } from "../../shared/types";
import type { DaemonContext } from "../../daemon/registry";
import { findProjectRoot } from "../../shared/project";
import { SessionManager } from "../session/manager";

export async function handleChallengeChange(
  request: IpcRequest,
  ctx: DaemonContext
): Promise<IpcResponse> {
  const { args, cwd, tag } = request;

  const conflictId = args.conflict as string | undefined;
  const reason = args.reason as string | undefined;

  // 引数検証
  if (!conflictId) {
    return { ok: false, error: "missing argument: --conflict <conflict-id>" };
  }

  if (!reason) {
    return { ok: false, error: "missing required option: --reason <reason>" };
  }

  // プロジェクトルートとチェーンIDを取得
  const projectRoot = findProjectRoot(cwd || process.cwd());
  const chainId = await SessionManager.resolveChainId(projectRoot, tag);

  const conflictManager = ctx.getConflictManager(projectRoot);

  // challenge 実行
  try {
    const conflict = await conflictManager.challengeConflict(conflictId, chainId, reason);

    if (!conflict) {
      return { ok: false, error: `conflict not found: ${conflictId}` };
    }

    const lines: string[] = [];
    lines.push(`challenge sent for conflict ${conflictId}`);
    lines.push("");
    lines.push(`from: ${chainId}`);
    lines.push(`to: ${conflict.initiator.chainId}`);
    lines.push(`reason: ${reason}`);
    lines.push("");
    lines.push(`file: ${conflict.filePath}`);
    lines.push(`lines: ${conflict.overlapStartLine}-${conflict.overlapEndLine}`);
    lines.push("");
    lines.push(`total challenges: ${conflict.challenges.length}`);

    return {
      ok: true,
      data: lines.join("\n"),
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
