import type { IpcResponse } from "../../shared/types";
import { getDapClient } from "../../dap/manager";
import { errorResponse } from "../../shared/output";
import { resolve } from "node:path";

export async function handleBreakpoint(args: Record<string, unknown>): Promise<IpcResponse> {
  const positional = (args._ as string[]) || [];
  const file = positional[0] || (args.file as string);
  const line = args.line as number | string;

  if (!file) return errorResponse("Missing required arg: file");
  if (!line) return errorResponse("Missing required arg: --line");

  const absPath = resolve(file);
  const lineNum = typeof line === "string" ? parseInt(line, 10) : line;

  const client = getDapClient();
  const bp = await client.setBreakpoint(absPath, lineNum);

  return { ok: true, data: `Breakpoint ${bp.id} set at ${absPath}:${lineNum}` };
}
