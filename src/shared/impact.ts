/**
 * 影響伝搬解析
 *
 * 変更されたシンボルの参照箇所を LSP で取得し、## impact セクションを生成する。
 */

import type { LspManager } from "../lsp/manager";
import type { DiagnosticRegistry } from "../lsp/diagnostic-registry";
import { readFileSync } from "node:fs";

export interface ImpactRef {
  filePath: string;
  line: number;
  lineContent: string;
  hasDiagnostic?: boolean;
}

const MAX_REFERENCES = 10;
const IMPACT_TIMEOUT_MS = 2000;

/**
 * 変更行から影響を受けるシンボルの参照箇所を取得する。
 */
export async function analyzeImpact(
  lspManager: LspManager,
  diagnosticRegistry: DiagnosticRegistry | undefined,
  filePath: string,
  changedLines: number[],
  content: string,
  projectRoot: string
): Promise<{ refs: ImpactRef[]; symbolName: string; totalCount: number } | null> {
  if (changedLines.length === 0) {
    return null;
  }

  try {
    const lines = content.split("\n");
    const symbolsToCheck = new Set<string>();

    // 変更行からシンボルを抽出
    for (const lineNum of changedLines) {
      if (lineNum > 0 && lineNum <= lines.length) {
        const line = lines[lineNum - 1];
        // 関数名、変数名、クラス名を検出（簡易版）
        const symbols = line.match(/\b[a-zA-Z_$][\w$]*\b/g);
        if (symbols) {
          for (const symbol of symbols) {
            // キーワードや短すぎるシンボルは除外
            if (symbol.length > 2 && !/^(const|let|var|function|class|import|export|from|return|if|else|for|while)$/.test(symbol)) {
              symbolsToCheck.add(symbol);
            }
          }
        }
      }
    }

    if (symbolsToCheck.size === 0) {
      return null;
    }

    // LSPクライアントを取得（既存のみ、新規起動しない）
    const client = lspManager.getExistingClient(projectRoot);
    if (!client) {
      return null; // LSP未起動なら impact なし
    }

    const uri = `file://${filePath}`;
    const languageId = filePath.endsWith(".ts") || filePath.endsWith(".tsx") ? "typescript" : "javascript";
    client.ensureOpen(uri, languageId, content);

    // 各シンボルの参照を取得
    const allRefs: ImpactRef[] = [];
    let primarySymbol = "";
    let maxRefsForSymbol = 0;

    try {
      for (const symbol of symbolsToCheck) {
        // 最初の変更行でシンボルを検索
        const firstChangedLine = changedLines[0];
        if (firstChangedLine > 0 && firstChangedLine <= lines.length) {
          const line = lines[firstChangedLine - 1];
          const col = line.indexOf(symbol);
          if (col === -1) continue;

          try {
            const refsOrNull = await Promise.race([
              client.getReferences(uri, { line: firstChangedLine - 1, character: col }).catch(() => null),
              new Promise<null>((r) => setTimeout(() => r(null), IMPACT_TIMEOUT_MS))
            ]);

            if (!refsOrNull || refsOrNull.length === 0) continue;
            const refs = refsOrNull;

            // 自ファイル内の参照を除外
            const externalRefs = refs.filter((ref: any) => ref.uri !== uri);

            if (externalRefs.length > maxRefsForSymbol) {
              maxRefsForSymbol = externalRefs.length;
              primarySymbol = symbol;
            }

            for (const ref of externalRefs) {
              const refPath = (ref as any).uri.replace("file://", "");
              try {
                const refContent = readFileSync(refPath, "utf-8");
                const refLines = refContent.split("\n");
                const refLine = (ref as any).range.start.line + 1;

                if (refLine > 0 && refLine <= refLines.length) {
                  const lineContent = refLines[refLine - 1].trim();

                  // 診断チェック
                  let hasDiagnostic = false;
                  if (diagnosticRegistry) {
                    const diags = diagnosticRegistry.getForFile(refPath);
                    hasDiagnostic = diags.some(
                      (d: any) => d.line === refLine && d.severity === "error"
                    );
                  }

                  allRefs.push({
                    filePath: refPath,
                    line: refLine,
                    lineContent,
                    hasDiagnostic,
                  });
                }
              } catch {
                // ファイル読み取りエラーは無視
              }
            }
          } catch {
            // LSP エラーは無視
          }
        }
      }
    } finally {
      // BufferManager が document lifecycle を管理するため、closeDocument は不要
    }

    if (allRefs.length === 0) {
      return null;
    }

    // 重複除去（同一ファイル・行）
    const uniqueRefs = Array.from(
      new Map(allRefs.map((ref) => [`${ref.filePath}:${ref.line}`, ref])).values()
    );

    // 上限適用
    const totalCount = uniqueRefs.length;
    const limitedRefs = uniqueRefs.slice(0, MAX_REFERENCES);

    return {
      refs: limitedRefs,
      symbolName: primarySymbol || symbolsToCheck.values().next().value || "unknown",
      totalCount,
    };
  } catch {
    return null;
  }
}

/**
 * ImpactRef 配列を ## impact セクションのテキストに変換する。
 */
export function formatImpactSection(
  refs: ImpactRef[],
  symbolName: string,
  totalCount: number
): string {
  if (refs.length === 0) {
    return "";
  }

  const lines: string[] = ["\n## impact"];

  const countText = totalCount > refs.length
    ? `${totalCount} reference(s) to ${symbolName} (${totalCount - refs.length} more not shown):`
    : `${totalCount} reference(s) to ${symbolName}:`;

  lines.push(countText);

  for (const ref of refs) {
    const marker = ref.hasDiagnostic ? "❌ " : "";
    const filePathShort = ref.filePath.replace(process.cwd() + "/", "");
    lines.push(`  ${filePathShort}:${ref.line}      ${marker}${ref.lineContent}`);
  }

  return lines.join("\n");
}
