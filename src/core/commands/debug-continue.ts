import type { IpcResponse } from "../../shared/types";
import { getDapClient } from "../../dap/manager";

export async function handleDebugContinue(): Promise<IpcResponse> {
  const client = getDapClient();
  await client.continue();
  return { ok: true, data: "Continued" };
}
