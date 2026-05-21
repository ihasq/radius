import type { IpcResponse } from "../../shared/types";
import { getDapClient } from "../../dap/manager";

export async function handleDebugList(): Promise<IpcResponse> {
  const client = getDapClient();
  const sessions = client.getSessions();

  if (sessions.length === 0) {
    return { ok: true, data: "No active debug sessions" };
  }

  const output = sessions.map((s) => `${s.id}: ${s.file}`).join("\n");
  return { ok: true, data: `Active debug sessions:\n${output}` };
}
