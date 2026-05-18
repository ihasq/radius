/**
 * Phase 19: snippet コマンドハンドラ。
 *
 * スニペットの一覧表示と挿入を行う。
 */

import { existsSync } from "node:fs";
import { resolve, relative, extname } from "node:path";
import { findProjectRoot } from "../../shared/project";
import type { IpcResponse } from "../../shared/types";
import type { LspManager } from "../../lsp/manager";
import type { HistoryTracker } from "../history/tracker";
import type { BufferManager } from "../buffer/manager";
import type { Changeset } from "../history/types";
import type { DiagnosticRegistry } from "../../lsp/diagnostic-registry";
import { collectAndFormatWithTracking } from "../../lsp/diagnostics";

/** スニペット定義。 */
interface Snippet {
  name: string;
  description: string;
  body: string[];
  prefix?: string;
}

/** 言語ごとの組み込みスニペット。 */
const BUILTIN_SNIPPETS: Record<string, Snippet[]> = {
  typescript: [
    {
      name: "for",
      description: "For loop",
      prefix: "for",
      body: ["for (let ${1:i} = 0; ${1:i} < ${2:array}.length; ${1:i}++) {", "  ${3:// body}", "}"],
    },
    {
      name: "foreach",
      description: "For-each loop",
      prefix: "foreach",
      body: ["for (const ${1:item} of ${2:array}) {", "  ${3:// body}", "}"],
    },
    {
      name: "if",
      description: "If statement",
      prefix: "if",
      body: ["if (${1:condition}) {", "  ${2:// body}", "}"],
    },
    {
      name: "ifelse",
      description: "If-else statement",
      prefix: "ifelse",
      body: ["if (${1:condition}) {", "  ${2:// then}", "} else {", "  ${3:// else}", "}"],
    },
    {
      name: "function",
      description: "Function declaration",
      prefix: "fn",
      body: ["function ${1:name}(${2:params}): ${3:void} {", "  ${4:// body}", "}"],
    },
    {
      name: "arrow",
      description: "Arrow function",
      prefix: "arrow",
      body: ["const ${1:name} = (${2:params}) => {", "  ${3:// body}", "};"],
    },
    {
      name: "class",
      description: "Class declaration",
      prefix: "class",
      body: ["class ${1:ClassName} {", "  constructor(${2:params}) {", "    ${3:// init}", "  }", "}"],
    },
    {
      name: "interface",
      description: "Interface declaration",
      prefix: "interface",
      body: ["interface ${1:InterfaceName} {", "  ${2:property}: ${3:type};", "}"],
    },
    {
      name: "try",
      description: "Try-catch block",
      prefix: "try",
      body: ["try {", "  ${1:// try}", "} catch (${2:error}) {", "  ${3:// catch}", "}"],
    },
    {
      name: "async",
      description: "Async function",
      prefix: "async",
      body: ["async function ${1:name}(${2:params}): Promise<${3:void}> {", "  ${4:// body}", "}"],
    },
  ],
  javascript: [], // TypeScript からコピー
};

// JavaScript は TypeScript と同じスニペットを使用
BUILTIN_SNIPPETS.javascript = BUILTIN_SNIPPETS.typescript;
BUILTIN_SNIPPETS.ts = BUILTIN_SNIPPETS.typescript;
BUILTIN_SNIPPETS.tsx = BUILTIN_SNIPPETS.typescript;
BUILTIN_SNIPPETS.js = BUILTIN_SNIPPETS.typescript;
BUILTIN_SNIPPETS.jsx = BUILTIN_SNIPPETS.typescript;

/**
 * snippet コマンドハンドラ。
 */
export async function handleSnippet(
  args: Record<string, unknown>,
  lspManager: LspManager,
  historyTracker: HistoryTracker | null,
  bufferManager: BufferManager,
  diagnosticRegistry: DiagnosticRegistry | null
): Promise<IpcResponse> {
  const list = args.list === true;
  const language = args.language as string | undefined;

  // --list: スニペット一覧を表示
  if (list) {
    return handleSnippetList(language);
  }

  // 挿入モード
  const file = args.file as string | undefined;
  const name = args.name as string | undefined;
  const lineArg = args.line as string | number | undefined;

  if (!file) {
    return { ok: false, error: "Missing required arg: file" };
  }

  if (!name) {
    return { ok: false, error: "Missing required arg: --name" };
  }

  if (!lineArg) {
    return { ok: false, error: "Missing required arg: --line" };
  }

  const absPath = resolve(file);

  if (!existsSync(absPath)) {
    return { ok: false, error: `File not found: ${absPath}` };
  }

  const projectRoot = findProjectRoot(absPath);
  const relativePath = relative(projectRoot, absPath);

  // ファイル内容を取得
  let content: string;
  try {
    content = bufferManager.getContent(absPath);
  } catch (err) {
    return {
      ok: false,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 言語を特定
  const ext = extname(absPath).slice(1).toLowerCase();
  const snippets = BUILTIN_SNIPPETS[ext] || BUILTIN_SNIPPETS.typescript;

  // スニペットを検索
  const snippet = snippets.find((s) => s.name === name || s.prefix === name);

  if (!snippet) {
    return { ok: false, error: `snippet not found: ${name}` };
  }

  const lineNumber = typeof lineArg === "number" ? lineArg : parseInt(lineArg as string, 10);
  if (isNaN(lineNumber)) {
    return { ok: false, error: "Invalid line number" };
  }

  const lines = content.split("\n");
  const insertIndex = Math.max(0, Math.min(lines.length, lineNumber - 1));

  // インデントを検出
  const indent = insertIndex > 0 ? detectIndent(lines[insertIndex - 1]) : "";

  // スニペット本文を展開（プレースホルダを単純化）
  const expandedBody = expandSnippet(snippet.body, indent);

  // 挿入
  lines.splice(insertIndex, 0, ...expandedBody.split("\n"));

  const newContent = lines.join("\n");
  const oldContent = content;

  // 変更を適用
  bufferManager.setContent(absPath, newContent);
  bufferManager.flush(absPath);

  // Changeset を記録
  if (historyTracker) {
    const changesetId = String(Date.now());
    const changeset: Changeset = {
      id: changesetId,
      timestamp: new Date().toISOString(),
      command: "snippet",
      description: `inserted snippet '${name}' at line ${lineNumber} in ${relativePath}`,
      changes: [
        {
          filePath: absPath,
          before: oldContent,
          after: newContent,
        },
      ],
    };
    await historyTracker.record(changeset);

    // 診断情報を収集
    let diagnosticsOutput = "";
    if (diagnosticRegistry) {
      diagnosticsOutput = await collectAndFormatWithTracking(
        lspManager,
        diagnosticRegistry,
        absPath,
        newContent
      );
    }

    const output = diagnosticsOutput
      ? [`inserted snippet '${name}' at line ${lineNumber}`, "", diagnosticsOutput].join("\n")
      : `inserted snippet '${name}' at line ${lineNumber}`;

    const insertedLineCount = expandedBody.split("\n").length;
    const newEndLine = lineNumber + insertedLineCount - 1;
    return {
      ok: true,
      data: output,
      changes: [{ filePath: absPath, startLine: lineNumber, endLine: lineNumber, newEndLine }],
    };
  }

  // historyTracker がない場合はタグなしで返す
  return { ok: true, data: `inserted snippet '${name}' at line ${lineNumber}` };
}

/**
 * スニペット一覧を表示する。
 */
function handleSnippetList(language?: string): IpcResponse {
  const lang = language || "typescript";
  const snippets = BUILTIN_SNIPPETS[lang] || BUILTIN_SNIPPETS.typescript;

  if (snippets.length === 0) {
    return { ok: true, data: `no snippets available for '${lang}'` };
  }

  const output: string[] = [`snippets for '${lang}':`];

  for (const snippet of snippets) {
    output.push(`  ${snippet.name}: ${snippet.description}`);
  }

  return { ok: true, data: output.join("\n") };
}

/**
 * スニペットを展開する。
 */
function expandSnippet(body: string[], indent: string): string {
  // プレースホルダ ${N:default} を default 値に置換
  const expanded = body.map((line) => {
    return indent + line.replace(/\$\{(\d+):([^}]*)\}/g, "$2").replace(/\$(\d+)/g, "");
  });
  return expanded.join("\n");
}

/**
 * 行のインデントを検出する。
 */
function detectIndent(line: string): string {
  const match = line.match(/^(\s*)/);
  return match ? match[1] : "";
}
