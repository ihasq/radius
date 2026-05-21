import type { IpcResponse } from "../../shared/types";
import { getDapClient } from "../../dap/manager";

export async function handleDebugStop(): Promise<IpcResponse> {
  const client = getDapClient();
  await client.stopSession();
  return { ok: true, data: "Debug session stopped" };
}
