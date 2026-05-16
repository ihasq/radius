import { dirname, resolve } from "node:path";
import { existsSync, statSync } from "node:fs";

/**
 * ファイルパスからプロジェクトルートを検出する。
 * tsconfig.json, package.json, .git のいずれかが存在するディレクトリまで
 * 親方向に探索する。見つからない場合はファイルの親ディレクトリを返す。
 */
const ROOT_MARKERS = ["tsconfig.json", "package.json", ".git"];

export function findProjectRoot(filePath: string): string {
  const absPath = resolve(filePath);
  // C: ディレクトリの場合はそこから、ファイルの場合は親ディレクトリから探索
  let dir: string;
  try {
    const stat = statSync(absPath);
    dir = stat.isDirectory() ? absPath : dirname(absPath);
  } catch {
    // ファイルが存在しない場合は親ディレクトリから探索
    dir = dirname(absPath);
  }
  const root = resolve("/");

  while (dir !== root) {
    for (const marker of ROOT_MARKERS) {
      if (existsSync(resolve(dir, marker))) {
        return dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // マーカーが見つからなければファイルの直近ディレクトリを返す。
  return dirname(resolve(filePath));
}
