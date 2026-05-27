/**
 * Shared CLI argument helpers.
 */

import { resolveSessionId, ensureSessionId, shouldAutoSession } from "../shared/paths";

/** True when the user asked for command help. */
export function wantsHelp(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

/** True when a positional path looks like a flag (e.g. `--help` passed as file). */
export function isFlagLikePath(path: string): boolean {
  return path.startsWith("-");
}

/** True when --tag was explicitly passed on the command line. */
export function hasTagOption(args: string[]): boolean {
  return args.includes("--tag");
}

/** Resolve session ID for CLI commands (auto-create when enabled). */
export function resolveCliSessionId(
  supportsTag: boolean | undefined,
  args: string[]
): string | undefined {
  if (supportsTag === false || hasTagOption(args)) {
    return resolveSessionId();
  }
  if (shouldAutoSession()) {
    return ensureSessionId();
  }
  return resolveSessionId();
}
