import type { IpcResponse } from "../../shared/types";
import { getDapClient } from "../../dap/manager";

export async function handleBreakpointList(): Promise<IpcResponse> {
  const client = getDapClient();
  const breakpoints = client.getBreakpoints();

  if (breakpoints.length === 0) {
    return { ok: true, data: "No breakpoints set" };
  }

  const output = breakpoints.map((bp) => `${bp.id}: ${bp.file} line ${bp.line}`).join("\n");
  return { ok: true, data: `Breakpoints:\n${output}` };
}
