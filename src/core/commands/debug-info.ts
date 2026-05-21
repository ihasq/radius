import type { IpcResponse } from "../../shared/types";
import { getDapClient } from "../../dap/manager";

export async function handleDebugInfo(): Promise<IpcResponse> {
  const client = getDapClient();
  const session = client.getCurrentSession();

  if (!session) {
    return { ok: true, data: "No active debug session" };
  }

  return { ok: true, data: `Session: ${session.id}\nFile: ${session.file}\nStarted: ${session.started}` };
}
