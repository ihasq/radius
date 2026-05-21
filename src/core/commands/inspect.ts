import type { IpcResponse } from "../../shared/types";
import { getDapClient } from "../../dap/manager";
import { errorResponse } from "../../shared/output";

export async function handleInspect(args: Record<string, unknown>): Promise<IpcResponse> {
  const positional = (args._ as string[]) || [];
  const expression = positional[0];

  if (!expression) return errorResponse("Missing expression");

  const client = getDapClient();
  const value = await client.evaluate(expression);

  return { ok: true, data: `${expression} = ${value}` };
}
