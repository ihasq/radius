/**
 * Git コンフリクトマーカーのパーサ。
 *
 * 標準2-way形式と diff3形式の両方を処理する。
 */

import { resolve } from "node:path";

/** 単一のコンフリクト領域。 */
export interface ConflictRegion {
  /** コンフリクトの通し番号（1始まり）。 */
  id: number;
  /** ours ブロックの開始行（1-indexed、マーカー行を含まない）。 */
  oursStartLine: number;
  /** ours ブロックの内容（行の配列）。 */
  ours: string[];
  /** base ブロックの内容（diff3形式の場合のみ。なければ null）。 */
  base: string[] | null;
  /** theirs ブロックの内容（行の配列）。 */
  theirs: string[];
  /** theirs 終端マーカーの後のブランチ名。 */
  theirsBranch: string;
}

/** パース結果。 */
export interface ParseResult {
  /** ファイルの絶対パス。 */
  filePath: string;
  /** 検出されたコンフリクトの数。 */
  conflictCount: number;
  /** 各コンフリクト領域。 */
  conflicts: ConflictRegion[];
}

/**
 * Git コンフリクトマーカーをパースする。
 *
 * @param filePath ファイルの絶対パス
 * @param content ファイル内容
 * @returns パース結果
 */
export function parseConflicts(filePath: string, content: string): ParseResult {
  const lines = content.split("\n");
  const conflicts: ConflictRegion[] = [];
  let conflictId = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // コンフリクト開始マーカーを検出（行頭固定）
    if (line?.startsWith("<<<<<<<")) {
      conflictId++;
      const oursStartLine = i + 2; // マーカー行の次の行（1-indexed）

      // ours ブロックを収集
      i++;
      const ours: string[] = [];
      while (i < lines.length && !lines[i]?.startsWith("||||||| ") && !lines[i]?.startsWith("=======")) {
        ours.push(lines[i] || "");
        i++;
      }

      // base ブロック（diff3形式の場合）
      let base: string[] | null = null;
      if (lines[i]?.startsWith("||||||| ")) {
        i++;
        base = [];
        while (i < lines.length && !lines[i]?.startsWith("=======")) {
          base.push(lines[i] || "");
          i++;
        }
      }

      // ======= マーカーをスキップ
      if (lines[i]?.startsWith("=======")) {
        i++;
      } else {
        // マーカーが揃っていない場合はスキップ
        continue;
      }

      // theirs ブロックを収集
      const theirs: string[] = [];
      while (i < lines.length && !lines[i]?.startsWith(">>>>>>>")) {
        theirs.push(lines[i] || "");
        i++;
      }

      // >>>>>>> マーカーとブランチ名を取得
      let theirsBranch = "";
      if (lines[i]?.startsWith(">>>>>>>")) {
        const match = lines[i]?.match(/^>>>>>>> (.+)$/);
        theirsBranch = match ? match[1] : "";
        i++;
      } else {
        // マーカーが揃っていない場合はスキップ
        continue;
      }

      // コンフリクト領域として記録
      conflicts.push({
        id: conflictId,
        oursStartLine,
        ours,
        base,
        theirs,
        theirsBranch,
      });
    } else {
      i++;
    }
  }

  return {
    filePath: resolve(filePath),
    conflictCount: conflicts.length,
    conflicts,
  };
}
