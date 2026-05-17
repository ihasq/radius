/**
 * import/export スキャナ。
 *
 * プロジェクト内の全ファイルを走査し、指定ファイルを参照する import 文を検出する。
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative, extname } from "node:path";

/** import エントリ。 */
export interface ImportEntry {
  /** import を含むファイルの絶対パス */
  filePath: string;
  /** import 文の行番号（1-indexed） */
  line: number;
  /** import 文中のモジュール指定子（例: "./utils", "../lib/config"） */
  specifier: string;
  /** 指定子が解決される絶対パス（拡張子補完後） */
  resolvedPath: string;
}

/** 対象ファイル拡張子 */
const TARGET_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/** 除外ディレクトリ */
const EXCLUDED_DIRS = ["node_modules", ".git", "dist", "build"];

/**
 * projectRoot 配下を走査し、指定ファイルを参照する全 import 文を返す。
 */
export async function findImportsTo(
  projectRoot: string,
  targetFile: string
): Promise<ImportEntry[]> {
  const targetAbsPath = resolve(targetFile);
  const allFiles = collectFiles(projectRoot);
  const results: ImportEntry[] = [];

  for (const filePath of allFiles) {
    const imports = extractImports(filePath, projectRoot);
    for (const imp of imports) {
      if (imp.resolvedPath === targetAbsPath) {
        results.push(imp);
      }
    }
  }

  return results;
}

/**
 * 指定ファイルが import しているモジュールの一覧を返す。
 */
export function findImportsFrom(
  filePath: string,
  projectRoot: string
): ImportEntry[] {
  return extractImports(filePath, projectRoot);
}

/**
 * プロジェクト配下の全対象ファイルを収集する。
 */
function collectFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);

      // 除外ディレクトリチェック
      if (EXCLUDED_DIRS.includes(entry)) {
        continue;
      }

      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        const ext = extname(fullPath);
        if (TARGET_EXTENSIONS.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * ファイル内の全 import/export 文を抽出する。
 */
function extractImports(filePath: string, projectRoot: string): ImportEntry[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.split("\n");
  const results: ImportEntry[] = [];

  // import/export 文の正規表現パターン
  const patterns = [
    // import { X } from "./path"
    // import X from "./path"
    // import * as X from "./path"
    /^\s*import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*]+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/,
    // import "./path"
    /^\s*import\s+['"]([^'"]+)['"]/,
    // export { X } from "./path"
    // export * from "./path"
    /^\s*export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/,
    // const X = require("./path")
    /^\s*(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    for (const pattern of patterns) {
      const match = pattern.exec(line);
      if (match && match[1]) {
        const specifier = match[1];

        // node_modules からの import は対象外（相対パスのみ）
        if (!specifier.startsWith(".")) {
          continue;
        }

        const resolvedPath = resolveModuleSpecifier(specifier, filePath, projectRoot);
        if (resolvedPath) {
          results.push({
            filePath,
            line: i + 1,
            specifier,
            resolvedPath,
          });
        }
        break;
      }
    }
  }

  return results;
}

/**
 * モジュール指定子を絶対パスに解決する。
 */
export function resolveModuleSpecifier(
  specifier: string,
  fromFile: string,
  projectRoot: string
): string | null {
  const fromDir = dirname(fromFile);
  const basePath = resolve(fromDir, specifier);

  // 解決順序
  const candidates = [
    basePath,                    // そのまま
    basePath + ".ts",
    basePath + ".tsx",
    basePath + ".js",
    basePath + ".jsx",
    join(basePath, "index.ts"),  // ディレクトリ import
    join(basePath, "index.js"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const stat = statSync(candidate);
        if (stat.isFile()) {
          return candidate;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}
