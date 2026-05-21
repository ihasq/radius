import type { IpcResponse } from "../../shared/types";
import { getDapClient } from "../../dap/manager";

export async function handleDebugStep(): Promise<IpcResponse> {
  const client = getDapClient();
  await client.step();
  return { ok: true, data: "Stepped" };
}
