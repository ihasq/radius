/**
 * 変数参照グラフ生成
 */

import { relative } from "node:path";
import { readFileSync } from "node:fs";
import type { LspManager } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import { MermaidBuilder } from "./mermaid";

/**
 * 指定シンボルの定義箇所と全参照箇所をグラフ化する。
 *
 * @param filePath 対象ファイルの絶対パス
 * @param symbolName シンボル名
 * @param projectRoot プロジェクトルート
 * @param lspManager LSPマネージャ
 * @param bufferManager バッファマネージャ
 * @returns Mermaid記法の文字列
 */
export async function generateRefGraph(
  filePath: string,
  symbolName: string,
  projectRoot: string,
  lspManager: LspManager,
  _bufferManager: BufferManager
): Promise<string> {
  const builder = new MermaidBuilder("TD");

  // シンボルの位置を特定（テキスト検索）
  const symbolPosition = findSymbolPosition(filePath, symbolName);
  if (!symbolPosition) {
    // シンボルが見つからない場合
    builder.addNode("error", `Symbol "${symbolName}" not found in ${relative(projectRoot, filePath)}`, "default");
    return builder.build();
  }

  // LSPでreferencesを取得
  let references: Array<{ uri: string; line: number; character: number }> = [];
  let engine = "text";

  try {
    const client = await lspManager.getClient(filePath, projectRoot);
    if (client) {
      const uri = `file://${filePath}`;
      const refs = await client.getReferences(uri, symbolPosition);
      if (refs && refs.length > 0) {
        references = refs.map((ref) => ({
          uri: ref.uri,
          line: ref.range.start.line,
          character: ref.range.start.character,
        }));
        engine = "lsp";
      }
    }
  } catch {
    // LSP失敗時はテキスト検索にフォールバック
  }

  // テキスト検索フォールバック
  if (references.length === 0) {
    references = textSearchReferences(filePath, symbolName, projectRoot);
  }

  // ノード数の上限チェック（30件まで）
  const maxNodes = 30;
  const truncated = references.length > maxNodes;
  const displayRefs = truncated ? references.slice(0, maxNodes) : references;

  // 定義ノード
  const defId = "def";
  const defPath = relative(projectRoot, filePath);
  const defLine = symbolPosition.line + 1;
  const defCode = getLineContent(filePath, symbolPosition.line);
  const defLabel = `${defPath}:${defLine} (definition)\n${defCode}`;
  builder.addNode(defId, defLabel, "highlight");

  // 参照ノード
  for (let i = 0; i < displayRefs.length; i++) {
    const ref = displayRefs[i];
    const refPath = ref.uri.startsWith("file://")
      ? ref.uri.slice(7)
      : ref.uri;
    const refRelPath = relative(projectRoot, refPath);
    const refLine = ref.line + 1;
    const refCode = getLineContent(refPath, ref.line);
    const refId = `ref${i}`;
    const refLabel = `${refRelPath}:${refLine}\n${refCode}`;
    builder.addNode(refId, refLabel, "default");
    builder.addEdge(defId, refId);
  }

  // 省略表示
  if (truncated) {
    const moreId = "more";
    const moreLabel = `... and ${references.length - maxNodes} more references`;
    builder.addNode(moreId, moreLabel, "default");
    builder.addEdge(defId, moreId);
  }

  // engine情報をコメントとして追加
  const result = builder.build();
  return `%% engine: ${engine}\n${result}`;
}

/**
 * ファイル内でシンボルの最初の出現位置を探す。
 */
function findSymbolPosition(
  filePath: string,
  symbolName: string
): { line: number; character: number } | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const index = lines[i].indexOf(symbolName);
      if (index !== -1) {
        return { line: i, character: index };
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * テキストベースでシンボルの参照を検索する。
 */
function textSearchReferences(
  filePath: string,
  symbolName: string,
  _projectRoot: string
): Array<{ uri: string; line: number; character: number }> {
  const results: Array<{ uri: string; line: number; character: number }> = [];
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      let index = 0;
      while ((index = lines[i].indexOf(symbolName, index)) !== -1) {
        results.push({
          uri: filePath,
          line: i,
          character: index,
        });
        index += symbolName.length;
      }
    }
  } catch {
    // エラー時は空配列
  }
  return results;
}

/**
 * 指定行のコード内容を取得する（40文字で切り詰め）。
 */
function getLineContent(filePath: string, line: number): string {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    if (line >= 0 && line < lines.length) {
      const code = lines[line].trim();
      return code.length > 40 ? code.slice(0, 37) + "..." : code;
    }
  } catch {
    return "";
  }
  return "";
}
