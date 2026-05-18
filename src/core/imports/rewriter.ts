/**
 * import/export リライタ。
 *
 * ファイル内の import 指定子を書き換える。
 */

import { dirname, relative, extname } from "node:path";

/** 書き換え結果。 */
export interface RewriteResult {
  /** 書き換えたファイルの絶対パス */
  filePath: string;
  /** 書き換えた行数 */
  editCount: number;
  /** 書き換え後のファイル全文 */
  newContent: string;
}

/**
 * 指定ファイル内の oldSpecifier を newSpecifier に書き換える。
 */
export function rewriteImports(
  filePath: string,
  content: string,
  oldSpecifier: string,
  newSpecifier: string
): RewriteResult {
  const lines = content.split("\n");
  let editCount = 0;

  // import/export 文のパターン（oldSpecifier を含む行を検出）
  const patterns = [
    // import { X } from "oldSpecifier"
    /^(\s*import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*]+|\*\s+as\s+\w+)\s+from\s+['"])([^'"]+)(['"])/,
    // import "oldSpecifier"
    /^(\s*import\s+['"])([^'"]+)(['"])/,
    // export { X } from "oldSpecifier"
    /^(\s*export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s+from\s+['"])([^'"]+)(['"])/,
    // const X = require("oldSpecifier")
    /^(\s*(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*['"])([^'"]+)(['"])/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    for (const pattern of patterns) {
      const match = pattern.exec(line);
      if (match && match[2] === oldSpecifier) {
        // 指定子を置換
        lines[i] = match[1] + newSpecifier + match[3];
        editCount++;
        break;
      }
    }
  }

  return {
    filePath,
    editCount,
    newContent: lines.join("\n"),
  };
}

/**
 * 旧ファイルパスと新ファイルパスから、参照元ファイルの視点での新しい相対パスを計算する。
 */
export function calculateNewSpecifier(
  fromFile: string,
  _oldTargetPath: string,
  newTargetPath: string,
  oldSpecifier: string
): string {
  const fromDir = dirname(fromFile);

  // 新しい相対パスを計算
  let newRelative = relative(fromDir, newTargetPath);

  // Unix パス区切りに正規化
  newRelative = newRelative.replace(/\\/g, "/");

  // 相対パスは "." または ".." で始まる必要がある
  if (!newRelative.startsWith(".")) {
    newRelative = "./" + newRelative;
  }

  // 拡張子の処理
  const oldHasExt = /\.(ts|tsx|js|jsx)$/.test(oldSpecifier);
  if (oldHasExt) {
    // 旧指定子に拡張子があった場合は保持
    // newRelative の拡張子を oldSpecifier の拡張子に置き換える
    const oldExt = extname(oldSpecifier);
    const newWithoutExt = newRelative.replace(/\.(ts|tsx|js|jsx)$/, "");
    newRelative = newWithoutExt + oldExt;
  } else {
    // 旧指定子に拡張子がなかった場合は除去
    newRelative = newRelative.replace(/\.(ts|tsx|js|jsx)$/, "");
  }

  return newRelative;
}
