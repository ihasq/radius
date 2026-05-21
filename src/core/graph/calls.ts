/**
 * 関数呼び出しグラフ生成
 */

import { relative } from "node:path";
import { readFileSync } from "node:fs";
import type { LspManager } from "../../lsp/manager";
import type { BufferManager } from "../buffer/manager";
import { MermaidBuilder } from "./mermaid";

/**
 * 指定関数の呼び出し関係をグラフ化する。
 *
 * @param filePath 対象ファイルの絶対パス
 * @param functionName 関数名
 * @param projectRoot プロジェクトルート
 * @param lspManager LSPマネージャ
 * @param bufferManager バッファマネージャ
 * @returns Mermaid記法の文字列
 */
export async function generateCallGraph(
  filePath: string,
  functionName: string,
  projectRoot: string,
  lspManager: LspManager,
  _bufferManager: BufferManager
): Promise<string> {
  const builder = new MermaidBuilder("TD");

  // 関数の位置を特定（テキスト検索）
  const functionPosition = findFunctionPosition(filePath, functionName);
  if (!functionPosition) {
    // 関数が見つからない場合
    builder.addNode("error", `Function "${functionName}" not found in ${relative(projectRoot, filePath)}`, "default");
    return builder.build();
  }

  // LSPでCall Hierarchy情報を取得
  let engine = "text";
  let incomingCalls: Array<{ from: { uri: string; line: number; name: string }; fromRanges: Array<{ line: number }> }> = [];
  let outgoingCalls: Array<{ to: { uri: string; line: number; name: string }; fromRanges: Array<{ line: number }> }> = [];

  try {
    // 既存のLSPクライアントのみを使用（新規起動しない）
    const client = lspManager.getExistingClient(projectRoot);
    if (client) {
      const uri = `file://${filePath}`;
      const items = await client.prepareCallHierarchy(uri, functionPosition);
      if (items && items.length > 0) {
        const item = items[0];
        const incoming = await client.incomingCalls(item);
        const outgoing = await client.outgoingCalls(item);

        // データ変換
        if (incoming && incoming.length > 0) {
          incomingCalls = incoming.map((call) => ({
            from: {
              uri: call.from.uri,
              line: call.from.selectionRange.start.line,
              name: call.from.name,
            },
            fromRanges: call.fromRanges.map((range) => ({ line: range.start.line })),
          }));
        }

        if (outgoing && outgoing.length > 0) {
          outgoingCalls = outgoing.map((call) => ({
            to: {
              uri: call.to.uri,
              line: call.to.selectionRange.start.line,
              name: call.to.name,
            },
            fromRanges: call.fromRanges.map((range) => ({ line: range.start.line })),
          }));
        }

        engine = "lsp";
      }
    }
  } catch {
    // LSP失敗時はテキスト検索にフォールバック
  }

  // テキスト検索フォールバック
  if (incomingCalls.length === 0 && outgoingCalls.length === 0) {
    const textCalls = textSearchCalls(filePath, functionName, projectRoot);
    if (textCalls.length > 0) {
      // テキスト検索結果を outgoingCalls に格納（簡易実装）
      outgoingCalls = textCalls.map((call) => ({
        to: {
          uri: call.uri,
          line: call.line,
          name: call.calleeText,
        },
        fromRanges: [{ line: call.line }],
      }));
    }
  }

  // ノード数の上限チェック（合計30件まで）
  const maxNodes = 30;
  const totalCalls = incomingCalls.length + outgoingCalls.length;
  const truncated = totalCalls > maxNodes;

  // 均等に分割する（incoming : outgoing = 1:1）
  const maxIncoming = Math.min(incomingCalls.length, Math.floor(maxNodes / 2));
  const maxOutgoing = Math.min(outgoingCalls.length, maxNodes - maxIncoming);
  const displayIncoming = incomingCalls.slice(0, maxIncoming);
  const displayOutgoing = outgoingCalls.slice(0, maxOutgoing);

  // 中央ノード（対象関数）
  const centerI = "center";
  const centerPath = relative(projectRoot, filePath);
  const centerLine = functionPosition.line + 1;
  const centerCode = getLineContent(filePath, functionPosition.line);
  const centerLabel = `${centerPath}:${centerLine}\\n${centerCode}`;
  builder.addNode(centerI, centerLabel, "highlight");

  // incoming calls（呼び出し元）
  for (let i = 0; i < displayIncoming.length; i++) {
    const call = displayIncoming[i];
    const fromPath = call.from.uri.startsWith("file://")
      ? call.from.uri.slice(7)
      : call.from.uri;
    const fromRelPath = relative(projectRoot, fromPath);
    const fromLine = call.from.line + 1;
    const fromCode = getLineContent(fromPath, call.from.line);
    const fromId = `in${i}`;
    const fromLabel = `${fromRelPath}:${fromLine}\\n${fromCode}`;
    builder.addNode(fromId, fromLabel, "default");
    builder.addEdge(fromId, centerI, "calls");
  }

  // outgoing calls（呼び出し先）
  for (let i = 0; i < displayOutgoing.length; i++) {
    const call = displayOutgoing[i];
    const toPath = call.to.uri.startsWith("file://")
      ? call.to.uri.slice(7)
      : call.to.uri;
    const toRelPath = relative(projectRoot, toPath);
    const toLine = call.to.line + 1;
    const toCode = getLineContent(toPath, call.to.line);
    const toId = `out${i}`;
    const toLabel = `${toRelPath}:${toLine}\\n${toCode}`;
    builder.addNode(toId, toLabel, "default");
    builder.addEdge(centerI, toId, "calls");
  }

  // 省略表示
  if (truncated) {
    const moreId = "more";
    const moreLabel = `... and ${totalCalls - (displayIncoming.length + displayOutgoing.length)} more calls`;
    builder.addNode(moreId, moreLabel, "default");
    builder.addEdge(centerI, moreId);
  }

  // engine情報をコメントとして追加
  const result = builder.build();
  return `%% engine: ${engine}\n${result}`;
}

/**
 * ファイル内で関数の最初の出現位置を探す。
 */
function findFunctionPosition(
  filePath: string,
  functionName: string
): { line: number; character: number } | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // 関数定義パターン（簡易実装）
    // function foo(), const foo = (), async function foo(), etc.
    const patterns = [
      new RegExp(`\\bfunction\\s+${functionName}\\s*\\(`),
      new RegExp(`\\bconst\\s+${functionName}\\s*=`),
      new RegExp(`\\blet\\s+${functionName}\\s*=`),
      new RegExp(`\\bvar\\s+${functionName}\\s*=`),
      new RegExp(`\\basync\\s+function\\s+${functionName}\\s*\\(`),
      new RegExp(`\\b${functionName}\\s*\\(`), // メソッド定義等
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of patterns) {
        const match = pattern.exec(line);
        if (match) {
          return { line: i, character: match.index };
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * テキストベースで関数の呼び出し箇所を検索する。
 */
function textSearchCalls(
  filePath: string,
  functionName: string,
  _projectRoot: string
): Array<{ uri: string; line: number; calleeText: string }> {
  const results: Array<{ uri: string; line: number; calleeText: string }> = [];
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // 関数呼び出しパターン（functionName()）
    const pattern = new RegExp(`\\b${functionName}\\s*\\(`, "g");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (pattern.test(line)) {
        results.push({
          uri: filePath,
          line: i,
          calleeText: functionName,
        });
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
