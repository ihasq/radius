/**
 * Phase 18: typehierarchy コマンドハンドラ。
 *
 * クラスやインタフェースの型階層を表示する。
 */

import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { findProjectRoot } from "../../shared/project";
import type { IpcResponse } from "../../shared/types";
import type { LspClient } from "../../lsp/client";
import type { BufferManager } from "../buffer/manager";
import type { LspTypeHierarchyItem } from "../../lsp/types";
import { errorResponse } from "../../shared/output";

const MAX_DEPTH = 5;

/**
 * typehierarchy コマンドハンドラ。
 */
export async function handleTypeHierarchy(
  args: Record<string, unknown>,
  lspClient: LspClient | null,
  bufferManager: BufferManager
): Promise<IpcResponse> {
  const file = args.file as string | undefined;
  const symbol = args.symbol as string | undefined;

  if (!file) {
    return errorResponse("Missing required arg: file");
  }

  if (!symbol) {
    return errorResponse("Missing required arg: --symbol");
  }

  const absPath = resolve(file);

  if (!existsSync(absPath)) {
    return errorResponse(`File not found: ${absPath}`);
  }

  const projectRoot = findProjectRoot(absPath);
  const uri = `file://${absPath}`;

  // LSPクライアントを使用
  const client = lspClient;
  if (!client) {
    return { ok: true, data: "type hierarchy unavailable (no LSP for this file type)" };
  }

  // ファイル内容を取得
  let content: string;
  try {
    content = bufferManager.getContent(absPath);
  } catch (err) {
    return errorResponse(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
  }

  const languageId = getLanguageId(absPath);

  // シンボルの位置を検索
  const lines = content.split("\n");
  let symbolPosition: { line: number; character: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const col = lines[i].indexOf(symbol);
    if (col !== -1) {
      // クラスやインタフェースの定義行を優先
      if (lines[i].match(/\b(class|interface)\s+\w+/)) {
        symbolPosition = { line: i, character: col };
        break;
      }
      // 他の場所で見つかった場合も記録
      if (!symbolPosition) {
        symbolPosition = { line: i, character: col };
      }
    }
  }

  if (!symbolPosition) {
    return errorResponse(`Symbol '${symbol}' not found in file`);
  }

  try {
    // 型階層の準備
    const items = await client.prepareTypeHierarchy(uri, symbolPosition);

    if (!items || items.length === 0) {
      return { ok: true, data: `no type hierarchy available for '${symbol}'` };
    }

    const item = items[0];

    // スーパータイプとサブタイプを取得
    const supertypes = await getHierarchy(client, item, "supertypes", MAX_DEPTH);
    const subtypes = await getHierarchy(client, item, "subtypes", MAX_DEPTH);

    // 出力を構築
    const output: string[] = [`type hierarchy: ${symbol}`, ""];

    if (supertypes.length > 0) {
      output.push("supertypes:");
      renderTree(supertypes, output, projectRoot, 1);
    }

    if (subtypes.length > 0) {
      if (supertypes.length > 0) output.push("");
      output.push("subtypes:");
      renderTree(subtypes, output, projectRoot, 1);
    }

    if (supertypes.length === 0 && subtypes.length === 0) {
      output.push("  (no supertypes or subtypes found)");
    }

    return { ok: true, data: output.join("\n") };
  } catch (err) {
    // Return graceful error for LSP failures
    return { ok: true, data: `no type hierarchy available for '${symbol}'` };
  }
}

interface HierarchyNode {
  item: LspTypeHierarchyItem;
  children: HierarchyNode[];
}

/**
 * 型階層を再帰的に取得する。
 */
async function getHierarchy(
  client: any,
  item: LspTypeHierarchyItem,
  direction: "supertypes" | "subtypes",
  maxDepth: number,
  depth: number = 0
): Promise<HierarchyNode[]> {
  if (depth >= maxDepth) {
    return [];
  }

  try {
    const related = direction === "supertypes"
      ? await client.typeHierarchySupertypes(item)
      : await client.typeHierarchySubtypes(item);

    const nodes: HierarchyNode[] = [];
    for (const r of related) {
      const children = await getHierarchy(client, r, direction, maxDepth, depth + 1);
      nodes.push({ item: r, children });
    }
    return nodes;
  } catch {
    return [];
  }
}

/**
 * 階層ツリーを描画する。
 */
function renderTree(
  nodes: HierarchyNode[],
  output: string[],
  projectRoot: string,
  depth: number
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const prefix = "  ".repeat(depth - 1) + (isLast ? "└── " : "├── ");
    const relPath = node.item.uri.startsWith("file://")
      ? relative(projectRoot, node.item.uri.slice(7))
      : node.item.uri;
    const line = node.item.range.start.line + 1;
    output.push(`${prefix}${node.item.name} (${relPath}:${line})`);

    if (node.children.length > 0) {
      renderTree(node.children, output, projectRoot, depth + 1);
    }
  }
}

/**
 * ファイル拡張子から言語IDを取得する。
 */
function getLanguageId(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    default:
      return "plaintext";
  }
}
