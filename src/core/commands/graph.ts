/**
 * graph コマンド実装
 *
 * Usage:
 *   graph imports <file> [--depth=N]
 *   graph refs <file> <symbol>
 *   graph calls <file> <function>
 */

import type { IpcRequest, IpcResponse } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import { generateImportGraph } from "../graph/imports";
import { generateRefGraph } from "../graph/refs";
import { generateCallGraph } from "../graph/calls";
import { existsSync } from "node:fs";

/**
 * graph コマンドハンドラ
 */
export async function handleGraph(
  request: IpcRequest,
  lspManager: LspManager,
  bufferManager: BufferManager,
  projectRoot: string
): Promise<IpcResponse> {
  const subcommand = request.args.subcommand as string | undefined;
  const filePath = request.args.file as string | undefined;

  if (!subcommand) {
    return {
      ok: false,
      error: "Usage: graph {imports|refs|calls} <file> [options]",
    };
  }

  if (!filePath) {
    return {
      ok: false,
      error: "Missing required argument: file",
    };
  }

  if (!existsSync(filePath)) {
    return {
      ok: false,
      error: `File not found: ${filePath}`,
    };
  }

  switch (subcommand) {
    case "imports":
      return await handleImports(request.args, filePath, projectRoot);

    case "refs":
      return await handleRefs(request.args, filePath, projectRoot, lspManager, bufferManager);

    case "calls":
      return await handleCalls(request.args, filePath, projectRoot, lspManager, bufferManager);

    default:
      return {
        ok: false,
        error: `Unknown graph subcommand: ${subcommand}. Use imports, refs, or calls.`,
      };
  }
}

/**
 * graph imports サブコマンド
 */
async function handleImports(
  args: Record<string, unknown>,
  filePath: string,
  projectRoot: string
): Promise<IpcResponse> {
  // depth オプションを解析
  let depth = 1;
  if (args.depth !== undefined) {
    const parsed = parseInt(String(args.depth), 10);
    if (!isNaN(parsed)) {
      depth = parsed;
    }
  }

  try {
    const mermaid = await generateImportGraph(filePath, projectRoot, depth);
    return {
      ok: true,
      data: mermaid,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to generate import graph: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * graph refs サブコマンド
 */
async function handleRefs(
  args: Record<string, unknown>,
  filePath: string,
  projectRoot: string,
  lspManager: LspManager,
  bufferManager: BufferManager
): Promise<IpcResponse> {
  const symbolName = args.symbol as string | undefined;
  if (!symbolName) {
    return {
      ok: false,
      error: "Usage: graph refs <file> <symbol> - Missing symbol name",
    };
  }

  try {
    const mermaid = await generateRefGraph(filePath, symbolName, projectRoot, lspManager, bufferManager);
    return {
      ok: true,
      data: mermaid,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to generate reference graph: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * graph calls サブコマンド
 */
async function handleCalls(
  args: Record<string, unknown>,
  filePath: string,
  projectRoot: string,
  lspManager: LspManager,
  bufferManager: BufferManager
): Promise<IpcResponse> {
  const functionName = args.function as string | undefined;
  if (!functionName) {
    return {
      ok: false,
      error: "Usage: graph calls <file> <function> - Missing function name",
    };
  }

  try {
    const mermaid = await generateCallGraph(filePath, functionName, projectRoot, lspManager, bufferManager);
    return {
      ok: true,
      data: mermaid,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to generate call graph: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
