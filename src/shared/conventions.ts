/**
 * プロジェクト規約解析
 *
 * tsconfig.json, .editorconfig, .prettierrc から規約を読み取り、
 * ## conventions セクションを生成する。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProjectConventions {
  indent?: string;
  module?: string;
  strict?: boolean;
  target?: string;
  semicolons?: boolean;
  quotes?: string;
}

/**
 * プロジェクトルートから規約を推定する。
 */
export function analyzeConventions(projectRoot: string): ProjectConventions | null {
  const conv: ProjectConventions = {};
  let hasAnyConfig = false;

  // 1. tsconfig.json
  const tsconfigPath = join(projectRoot, "tsconfig.json");
  if (existsSync(tsconfigPath)) {
    try {
      const tsconfigContent = readFileSync(tsconfigPath, "utf-8");
      const tsconfig = JSON.parse(tsconfigContent);

      if (tsconfig.compilerOptions) {
        const opts = tsconfig.compilerOptions;

        // module
        if (opts.module) {
          const moduleValue = String(opts.module).toLowerCase();
          if (moduleValue.includes("es") || moduleValue === "esnext") {
            conv.module = "ESM";
          } else if (moduleValue === "commonjs") {
            conv.module = "CommonJS";
          }
        }

        // strict
        if (typeof opts.strict === "boolean") {
          conv.strict = opts.strict;
        }

        // target
        if (opts.target) {
          conv.target = String(opts.target);
        }
      }

      hasAnyConfig = true;
    } catch {
      // JSON パースエラーは無視
    }
  }

  // 2. .editorconfig
  const editorconfigPath = join(projectRoot, ".editorconfig");
  if (existsSync(editorconfigPath)) {
    try {
      const content = readFileSync(editorconfigPath, "utf-8");

      // indent_style と indent_size を検出
      const styleMatch = content.match(/indent_style\s*=\s*(\w+)/);
      const sizeMatch = content.match(/indent_size\s*=\s*(\d+)/);

      if (styleMatch) {
        if (styleMatch[1] === "tab") {
          conv.indent = "tab";
        } else if (styleMatch[1] === "space" && sizeMatch) {
          conv.indent = `${sizeMatch[1]} spaces`;
        }
      }

      hasAnyConfig = true;
    } catch {
      // 読み取りエラーは無視
    }
  }

  // 3. .prettierrc / .prettierrc.json
  const prettierPaths = [
    join(projectRoot, ".prettierrc"),
    join(projectRoot, ".prettierrc.json"),
  ];

  for (const prettierPath of prettierPaths) {
    if (existsSync(prettierPath)) {
      try {
        const content = readFileSync(prettierPath, "utf-8");
        const prettier = JSON.parse(content);

        // semicolons
        if (typeof prettier.semi === "boolean") {
          conv.semicolons = prettier.semi;
        }

        // quotes
        if (typeof prettier.singleQuote === "boolean") {
          conv.quotes = prettier.singleQuote ? "single" : "double";
        }

        // indent (prettier が上書き)
        if (typeof prettier.tabWidth === "number") {
          conv.indent = `${prettier.tabWidth} spaces`;
        }
        if (prettier.useTabs === true) {
          conv.indent = "tab";
        }

        hasAnyConfig = true;
      } catch {
        // JSON パースエラーは無視
      }
    }
  }

  return hasAnyConfig ? conv : null;
}

/**
 * ProjectConventions を ## conventions セクションのテキストに変換する。
 */
export function formatConventionsSection(conv: ProjectConventions): string {
  const lines: string[] = ["\n## conventions"];

  if (conv.indent) {
    lines.push(`indent: ${conv.indent}`);
  }

  if (conv.module) {
    lines.push(`module: ${conv.module}`);
  }

  if (conv.strict !== undefined) {
    lines.push(`strict: ${conv.strict}`);
  }

  if (conv.target) {
    lines.push(`target: ${conv.target}`);
  }

  if (conv.semicolons !== undefined) {
    lines.push(`semicolons: ${conv.semicolons}`);
  }

  if (conv.quotes) {
    lines.push(`quotes: ${conv.quotes}`);
  }

  // 何も設定がない場合は空文字列を返す
  if (lines.length === 1) {
    return "";
  }

  return lines.join("\n");
}
