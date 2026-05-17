/**
 * Phase 15: ファイルglob マッチング
 *
 * replace-all コマンドの --include / --exclude オプション処理。
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Glob } from "bun";

export interface GlobOptions {
  include?: string[];    // 例: ["*.ts", "*.tsx"]
  exclude?: string[];    // 例: ["*.test.ts", "node_modules/**"]
}

/**
 * 常に除外するディレクトリ
 */
const ALWAYS_EXCLUDE = ["node_modules", ".git", "dist", "build", ".radius"];

/**
 * ファイルパスがglobパターンにマッチするか判定する。
 */
function matchesGlob(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const glob = new Glob(pattern);
    if (glob.match(filePath)) {
      return true;
    }
  }
  return false;
}

/**
 * ディレクトリ配下のファイルを再帰的に走査し、
 * globフィルタを適用したファイルパス一覧を返す。
 * node_modules, .git, dist, build は常に除外する。
 */
export function findFiles(dir: string, opts: GlobOptions = {}): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return; // アクセス不可ディレクトリはスキップ
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue; // statに失敗したファイルはスキップ
      }

      if (stat.isDirectory()) {
        // 常に除外するディレクトリをチェック
        if (ALWAYS_EXCLUDE.includes(entry)) {
          continue;
        }
        walk(fullPath);
      } else if (stat.isFile()) {
        const relativePath = relative(dir, fullPath);

        // exclude チェック
        if (opts.exclude && opts.exclude.length > 0) {
          if (matchesGlob(relativePath, opts.exclude)) {
            continue;
          }
        }

        // include チェック（指定されている場合のみ）
        if (opts.include && opts.include.length > 0) {
          if (!matchesGlob(relativePath, opts.include)) {
            continue;
          }
        }

        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}
