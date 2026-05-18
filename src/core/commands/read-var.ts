/**
 * read-var コマンドハンドラ。
 *
 * 指定ファイル内の変数の定義・参照箇所を、周辺コンテキスト付きで返す。
 * LSPが利用可能な場合はセマンティックな参照解決を行い、
 * 利用不可能な場合はテキスト検索にフォールバックする。
 */

import { resolve } from "node:path";
import { LspManager, resolveLanguageId } from "../../lsp/manager";
import { findProjectRoot } from "../../shared/project";
import type { LspLocation } from "../../lsp/types";
import type { IpcResponse } from "../../shared/types";
import type { BufferManager } from "../buffer/manager";
import { errorResponse } from "../../shared/output";

/** 各出現箇所の前後に含めるコンテキスト行数。 */
const CONTEXT_LINES = 3;

/** A4: リトライロジックの定数 */
const INITIAL_WAIT_MS = 1000;  // rust-analyzer等のインデックス構築を考慮
const RETRY_INTERVAL_MS = 2000; // より長い間隔でリトライ
const MAX_RETRIES = 5;          // リトライ回数を増加 (合計 1000 + 2000*4 = 9000ms)

interface Occurrence {
  kind: "definition" | "reference";
  line: number; // 1-indexed（人間可読）
  context: string;
}

interface ReadVarResult {
  variable: string;
  file: string;
  projectRoot: string;
  engine: "lsp" | "text";
  occurrences: Occurrence[];
}

/**
 * ファイルの行配列から、指定行の周辺コンテキストを抽出する。
 * 行番号付きで返す。
 */
function extractContext(
  lines: string[],
  lineIndex: number // 0-indexed
): string {
  const start = Math.max(0, lineIndex - CONTEXT_LINES);
  const end = Math.min(lines.length - 1, lineIndex + CONTEXT_LINES);
  const result: string[] = [];
  for (let i = start; i <= end; i++) {
    const marker = i === lineIndex ? ">" : " ";
    const lineNum = String(i + 1).padStart(4, " ");
    result.push(`${marker}${lineNum}: ${lines[i]}`);
  }
  return result.join("\n");
}

/**
 * テキストベースのフォールバック検索。
 * 単語境界を考慮した正規表現で変数名を検索する。
 */
function textSearch(
  lines: string[],
  varName: string
): Occurrence[] {
  const pattern = new RegExp(`\\b${escapeRegex(varName)}\\b`, "g");
  const occurrences: Occurrence[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i]) && !seen.has(i)) {
      seen.add(i);
      occurrences.push({
        kind: occurrences.length === 0 ? "definition" : "reference",
        line: i + 1,
        context: extractContext(lines, i),
      });
    }
    pattern.lastIndex = 0;
  }
  return occurrences;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * LSPを使用した参照解決。
 */
async function lspSearch(
  lspManager: LspManager,
  filePath: string,
  projectRoot: string,
  lines: string[],
  varName: string
): Promise<Occurrence[] | null> {
  const client = await lspManager.getClient(filePath, projectRoot);
  if (!client) return null;

  const uri = `file://${filePath}`;
  const languageId = resolveLanguageId(filePath);
  const content = lines.join("\n");

  // ドキュメントを開く。
  client.openDocument(uri, languageId, content);

  // 変数名の最初の出現位置を探す（LSP references のアンカーとして使用）。
  const pattern = new RegExp(`\\b${escapeRegex(varName)}\\b`);
  let anchorLine = -1;
  let anchorChar = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = pattern.exec(lines[i]);
    if (match) {
      anchorLine = i;
      anchorChar = match.index;
      break;
    }
  }

  if (anchorLine === -1) return null;

  // A4: リトライロジック
  await Bun.sleep(INITIAL_WAIT_MS);
  let attempt = 0;
  let locations: LspLocation[] | null = null;

  while (attempt < MAX_RETRIES) {
    // クライアントの生存確認
    if (!client.isAlive) {
      return null;
    }

    try {
      locations = await client.getReferences(uri, {
        line: anchorLine,
        character: anchorChar,
      });

      // 有効なレスポンスを得られた場合
      if (locations && locations.length > 0) {
        break;
      }
    } catch {
      // リクエスト失敗
    }

    attempt++;
    if (attempt >= MAX_RETRIES) {
      return null;
    }

    await Bun.sleep(RETRY_INTERVAL_MS);
  }

  if (!locations || locations.length === 0) return null;

  // LspLocation を Occurrence に変換する。
  // 対象ファイル内の参照のみを返す（他ファイルの参照は除外）。
  const targetUri = uri;
  const occurrences: Occurrence[] = [];
  const seen = new Set<number>();

  for (const loc of locations) {
    if (loc.uri !== targetUri) continue;
    const lineIdx = loc.range.start.line;
    if (seen.has(lineIdx)) continue;
    seen.add(lineIdx);
    occurrences.push({
      kind: occurrences.length === 0 ? "definition" : "reference",
      line: lineIdx + 1,
      context: extractContext(lines, lineIdx),
    });
  }

  // 行番号でソートする。
  occurrences.sort((a, b) => a.line - b.line);
  // 最初の出現を definition に再ラベルする。
  if (occurrences.length > 0) {
    occurrences[0].kind = "definition";
    for (let i = 1; i < occurrences.length; i++) {
      occurrences[i].kind = "reference";
    }
  }

  return occurrences;
}

/**
 * read-var コマンドのエントリポイント。
 * daemon/main.ts から呼び出される。
 */
export async function handleReadVar(
  args: Record<string, unknown>,
  lspManager: LspManager,
  bufferManager: BufferManager
): Promise<IpcResponse> {
  const filePath = args.file as string | undefined;
  const varName = args.var as string | undefined;

  if (!filePath || !varName) {
    return errorResponse("Missing required args: file, var");
  }

  const absPath = resolve(filePath);

  // BufferManager からファイル内容を取得
  let content: string;
  try {
    content = bufferManager.getContent(absPath);
  } catch {
    return errorResponse(`Cannot read file: ${absPath}`);
  }

  const lines = content.split("\n");
  const projectRoot = findProjectRoot(absPath);

  // LSPで試行し、失敗すればテキスト検索にフォールバック。
  let occurrences = await lspSearch(lspManager, absPath, projectRoot, lines, varName);
  let engine: "lsp" | "text" = "lsp";

  if (!occurrences || occurrences.length === 0) {
    occurrences = textSearch(lines, varName);
    engine = "text";
  }

  if (occurrences.length === 0) {
    return errorResponse(`Variable "${varName}" not found in ${absPath}`);
  }

  const result: ReadVarResult = {
    variable: varName,
    file: absPath,
    projectRoot,
    engine,
    occurrences,
  };

  // LLM向けの可読フォーマットで出力する。
  const output = formatForLlm(result);
  return { ok: true, data: output };
}

/**
 * LLMが効率的に読み取れるテキスト形式にフォーマットする。
 */
function formatForLlm(result: ReadVarResult): string {
  const header = [
    `variable: ${result.variable}`,
    `file: ${result.file}`,
    `engine: ${result.engine}`,
    `occurrences: ${result.occurrences.length}`,
  ].join("\n");

  const body = result.occurrences
    .map((occ) => {
      return `\n--- ${occ.kind} (line ${occ.line}) ---\n${occ.context}`;
    })
    .join("\n");

  return header + "\n" + body;
}
