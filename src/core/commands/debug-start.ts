/**
 * Phase 6: debug-start コマンド
 */

import type { IpcResponse } from "../../shared/types";
import { getDapClient } from "../../dap/manager";
import { errorResponse } from "../../shared/output";
import { resolve } from "node:path";

export async function handleDebugStart(args: Record<string, unknown>): Promise<IpcResponse> {
  const positional = (args._ as string[]) || [];
  const file = positional[0] || (args.file as string);

  if (!file) {
    return errorResponse("Missing required arg: file");
  }

  const absPath = resolve(file);
  const client = getDapClient();

  try {
    const sessionId = await client.startSession(absPath);
    return {
      ok: true,
      data: `Debug session started: ${sessionId}\nFile: ${absPath}`,
    };
  } catch (err) {
    return errorResponse(`Failed to start debug session: ${err instanceof Error ? err.message : String(err)}`);
  }
}
