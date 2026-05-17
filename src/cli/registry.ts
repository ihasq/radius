/**
 * CLI コマンドレジストリ。
 *
 * コマンド定義を宣言的に登録し、if-else連鎖を排除する。
 */

import { resolve } from "node:path";
import type { IpcRequest } from "../shared/types";

/** コマンド定義。 */
export interface CommandDef {
  /** コマンド名（"ping", "read-var" など）。 */
  name: string;
  /** usageメッセージでの説明。 */
  description: string;
  /** 使用方法の文字列。 */
  usage: string;
  /** 詳細ヘルプ文字列（--help 時に表示）。 */
  help: string;
  /** CLIの argv（コマンド名を除く）から IpcRequest を構築する。
   *  バリデーション失敗時は usage 文字列を throw する。
   *  @param stdin - --stdin指定時の標準入力内容（任意） */
  buildRequest(args: string[], cwd: string, stdin?: string): IpcRequest;
  /** --tag オプションをサポートするかどうか（デフォルト: true）。 */
  supportsTag?: boolean;
}

/** 引数パーサ（既存の parseArgs と同等）。 */
function parseArgs(args: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      // 次の引数が存在し、かつ -- で始まらない場合は値として扱う
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        result[key] = args[++i];
      } else {
        // 値がない場合はboolean flagとして扱う
        result[key] = true;
      }
    }
  }
  return result;
}

/**
 * --tag オプションを除外した引数を返す。
 * @param args 元の引数配列
 * @returns { filtered: 除外後の引数, tag: 抽出されたタグ値 }
 */
function extractTag(args: string[]): { filtered: string[]; tag?: string | null } {
  const filtered: string[] = [];
  let tag: string | null | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--tag") {
      // --tag <value> の形式
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        tag = args[i + 1];
        i++; // 次の引数をスキップ
      } else {
        // --tag のみの場合は null として扱う（初回呼び出しの意図）
        tag = null;
      }
    } else {
      filtered.push(arg);
    }
  }

  return { filtered, tag };
}

/**
 * CommandDef.buildRequest をラップし、--tag と cwd を IpcRequest に追加する。
 * @param cmd コマンド定義
 * @param args 元の引数配列
 * @param cwd 現在のワーキングディレクトリ
 * @param stdin 標準入力（任意）
 * @returns IpcRequest（tag と cwd を含む）
 */
export function buildRequestWithTag(
  cmd: CommandDef,
  args: string[],
  cwd: string,
  stdin?: string
): IpcRequest {
  // --tag オプションをサポートしない場合はそのまま構築
  if (cmd.supportsTag === false) {
    return cmd.buildRequest(args, cwd, stdin);
  }

  // --tag を抽出
  const { filtered, tag } = extractTag(args);
  const request = cmd.buildRequest(filtered, cwd, stdin);

  // tag と cwd を追加
  request.tag = tag;
  request.cwd = cwd;

  // --agent を検出（非推奨警告のため）
  const parsed = parseArgs(args);
  if (parsed.agent !== undefined) {
    request.args.agent = parsed.agent;
  }

  return request;
}

/** コマンド定義一覧。 */
export const commands: CommandDef[] = [
  {
    name: "ping",
    description: "デーモンとの疎通確認",
    usage: "radius ping",
    help: `usage: radius ping

Check if the Radius daemon is running.

examples:
  radius ping`,
    supportsTag: false,
    buildRequest: (_args, _cwd, _stdin) => ({ command: "ping", args: {} }),
  },
  {
    name: "read-var",
    description: "変数の参照箇所を取得",
    usage: "radius read-var <file> --var <name>",
    help: `usage: radius read-var <file> --var <name> [--tag T]

Find variable definition and all references using LSP.

options:
  --var <name>   Variable name to search for (required)
  --tag <tag>    Session tag from previous command output

examples:
  radius read-var src/api.ts --var httpClient
  radius read-var src/utils.ts --var PI --tag abc1-XXXXXXXX`,
    buildRequest: (args, cwd, _stdin) => {
      const file = args[0];
      const parsed = parseArgs(args.slice(1));
      if (!file || !parsed.var) {
        throw "usage: radius read-var <file> --var <name>";
      }
      const absFile = resolve(cwd, file);
      return {
        command: "read-var",
        args: { file: absFile, var: parsed.var },
      };
    },
  },
  {
    name: "modify-var",
    description: "変数名の一括変更",
    usage: "radius modify-var <file> --from <old> --to <new>",
    help: `usage: radius modify-var <file> --from <old> --to <new> [--tag T]

Rename a variable across all its references using LSP.

options:
  --from <name>  Current variable name (required)
  --to <name>    New variable name (required)
  --tag <tag>    Session tag from previous command output

examples:
  radius modify-var src/api.ts --from httpClient --to apiClient
  radius modify-var src/utils.ts --from PI --to PI_VALUE --tag abc1-XXXXXXXX`,
    buildRequest: (args, cwd, _stdin) => {
      const file = args[0];
      const parsed = parseArgs(args.slice(1));
      if (!file || !parsed.from || !parsed.to) {
        throw "usage: radius modify-var <file> --from <oldName> --to <newName>";
      }
      const absFile = resolve(cwd, file);
      return {
        command: "modify-var",
        args: { file: absFile, from: parsed.from, to: parsed.to },
      };
    },
  },
  {
    name: "undo",
    description: "直前の操作を取り消す",
    usage: "radius undo",
    help: `usage: radius undo [--tag T]

Undo the last edit operation in the current session.

options:
  --tag <tag>    Session tag from previous command output

examples:
  radius undo --tag abc1-XXXXXXXX`,
    buildRequest: (args, cwd, _stdin) => {
      return { command: "undo", args: { cwd } };
    },
  },
  {
    name: "redo",
    description: "取り消した操作を再適用",
    usage: "radius redo",
    help: `usage: radius redo [--tag T]

Redo an undone operation in the current session.

options:
  --tag <tag>    Session tag from previous command output

examples:
  radius redo --tag abc1-XXXXXXXX`,
    buildRequest: (args, cwd, _stdin) => {
      return { command: "redo", args: { cwd } };
    },
  },
  {
    name: "solve-conflict",
    description: "コンフリクトの表示と解決",
    usage: "radius solve-conflict <file> [--accept ours|theirs] [--id <N>] [--content <text>]",
    help: `usage: radius solve-conflict <file> [--accept ours|theirs] [--id <N>] [--content <text>] [--tag T]

Show and resolve git merge conflicts in a file.

options:
  --accept <side>   Accept 'ours' or 'theirs' for all conflicts
  --id <N>          Resolve only conflict with this ID
  --content <text>  Custom resolution content (use with --id)
  --tag <tag>       Session tag from previous command output

examples:
  radius solve-conflict src/api.ts                           # Show conflicts
  radius solve-conflict src/api.ts --accept ours             # Accept all ours
  radius solve-conflict src/api.ts --id 1 --accept theirs    # Accept theirs for conflict 1
  radius solve-conflict src/api.ts --id 1 --content "merged" # Custom resolution`,
    buildRequest: (args, cwd, _stdin) => {
      const file = args[0];
      if (!file) {
        throw "usage: radius solve-conflict <file> [--accept ours|theirs] [--id <N>] [--content <text>]";
      }
      const absFile = resolve(cwd, file);
      const parsed = parseArgs(args.slice(1));
      return {
        command: "solve-conflict",
        args: { file: absFile, ...parsed },
      };
    },
  },
  {
    name: "rename-file",
    description: "ファイルのリネームとimport更新",
    usage: "radius rename-file <oldPath> <newPath>",
    help: `usage: radius rename-file <oldPath> <newPath> [--tag T]

Rename a file and update all import statements across the project.

options:
  --tag <tag>    Session tag from previous command output

examples:
  radius rename-file src/api.ts src/apiClient.ts
  radius rename-file src/utils/helpers.ts src/lib/helpers.ts --tag abc1-XXXXXXXX`,
    buildRequest: (args, cwd, _stdin) => {
      const oldPath = args[0];
      const newPath = args[1];
      if (!oldPath || !newPath) {
        throw "usage: radius rename-file <oldPath> <newPath>";
      }
      const absOldPath = resolve(cwd, oldPath);
      const absNewPath = resolve(cwd, newPath);
      return {
        command: "rename-file",
        args: { file: absOldPath, to: absNewPath },
      };
    },
  },
  {
    name: "ext",
    description: "拡張管理 (install/list/remove)",
    usage: "radius ext <install|list|remove> [args]",
    help: `usage: radius ext <install|list|remove> [args]

Manage VSCode extensions for language support.

subcommands:
  install <id|path>   Install extension from Open VSX or local path
  list                List installed extensions
  remove <id>         Remove an installed extension

examples:
  radius ext install rust-lang.rust-analyzer    # Install from Open VSX
  radius ext install ./my-extension             # Install local extension
  radius ext list                               # List installed
  radius ext remove rust-lang.rust-analyzer     # Remove extension`,
    buildRequest: (args, cwd, _stdin) => {
      const subcommand = args[0];
      if (!subcommand) {
        throw "usage: radius ext <install|list|remove> [args]";
      }

      if (subcommand === "install") {
        const source = args[1];
        if (!source) {
          throw "usage: radius ext install <path>";
        }
        // レジストリID判定: "/" を含まず "." でちょうど2つに分割できる場合
        const isRegistryId = !source.includes("/") && source.split(".").length === 2;
        // レジストリIDの場合はそのまま渡し、ローカルパスの場合は絶対パス化
        const absSource = isRegistryId ? source : resolve(cwd, source);
        return {
          command: "ext-install",
          args: { source: absSource },
        };
      } else if (subcommand === "list") {
        return {
          command: "ext-list",
          args: {},
        };
      } else if (subcommand === "remove") {
        const extensionId = args[1];
        if (!extensionId) {
          throw "usage: radius ext remove <extensionId>";
        }
        return {
          command: "ext-remove",
          args: { extensionId },
        };
      } else {
        throw `unknown ext subcommand: ${subcommand}`;
      }
    },
  },
  {
    name: "view",
    description: "ファイル閲覧・ディレクトリ一覧",
    usage: "radius view <path> [--range <start>:<end>]",
    help: `usage: radius view <path> [--range <start>:<end>] [--tag T]

View file contents with line numbers, or list directory contents.

options:
  --range <S:E>  Show only lines S through E (1-indexed)
  --tag <tag>    Session tag from previous command output

examples:
  radius view src/api.ts                    # View entire file
  radius view src/api.ts --range 10:20      # View lines 10-20
  radius view src/                          # List directory`,
    buildRequest: (args, cwd, _stdin) => {
      const path = args[0];
      if (!path) {
        throw "usage: radius view <path> [--range <start>:<end>]";
      }
      const absPath = resolve(cwd, path);
      const parsed = parseArgs(args.slice(1));
      return {
        command: "view",
        args: {
          path: absPath,
          range: parsed.range,
        },
      };
    },
  },
  {
    name: "str-replace",
    description: "文字列の完全一致置換",
    usage: "radius str-replace <file> --old <text> --new <text> | --stdin [--old|--new]",
    help: `usage: radius str-replace <file> --old <text> --new <text> [--tag T] [--reason R]
       radius str-replace <file> --new <text> --stdin [--tag T]

Replace exact string matches in a file.

options:
  --old <text>     Text to find (required unless --stdin)
  --new <text>     Replacement text (required unless --stdin)
  --stdin          Read --old or --new from stdin (for multiline content)
  --reason <text>  Explanation for the change (required if conflicting with other agents)
  --tag <tag>      Session tag from previous command output

stdin mode:
  Use --stdin to provide multiline content. Specify either --old or --new
  on the command line, and the other will be read from stdin.

examples:
  radius str-replace src/api.ts --old "foo" --new "bar"
  radius str-replace src/api.ts --old "foo" --new "bar" --tag abc1-XXXXXXXX

  # Multiline replacement (--old from stdin):
  echo 'function old() {
    return 1;
  }' | radius str-replace src/api.ts --new "function new() { return 2; }" --stdin

  # With conflict reason:
  radius str-replace src/api.ts --old "foo" --new "bar" --reason "fixing naming"`,
    buildRequest: (args, cwd, stdin) => {
      const file = args[0];
      const parsed = parseArgs(args.slice(1));

      // --stdin モード: --old または --new のどちらかを stdin から取得
      let oldText = parsed.old as string | undefined;
      let newText = parsed.new as string | undefined;

      if (parsed.stdin !== undefined) {
        if (!stdin) {
          throw "error: --stdin specified but no input provided";
        }
        // --old と --new のどちらが指定されているかで stdin の使用先を決定
        if (oldText === undefined && newText !== undefined) {
          oldText = stdin;
        } else if (newText === undefined && oldText !== undefined) {
          newText = stdin;
        } else if (oldText === undefined && newText === undefined) {
          throw "usage: specify either --old or --new when using --stdin";
        } else {
          throw "usage: cannot use --stdin with both --old and --new specified";
        }
      }

      if (!file || oldText === undefined || newText === undefined) {
        throw "usage: radius str-replace <file> --old <text> --new <text> | --stdin [--old|--new]";
      }
      const absFile = resolve(cwd, file);
      return {
        command: "str-replace",
        args: {
          file: absFile,
          old: oldText,
          new: newText,
          reason: parsed.reason,
        },
      };
    },
  },
  {
    name: "create",
    description: "新規ファイルの作成",
    usage: "radius create <file> [--content <text> | --stdin]",
    help: `usage: radius create <file> --content <text> [--tag T]
       radius create <file> --stdin [--tag T]

Create a new file with the specified content.

options:
  --content <text>  File content (required unless --stdin)
  --stdin           Read content from stdin (for multiline content)
  --tag <tag>       Session tag from previous command output

stdin mode:
  Use --stdin to provide multiline file content via pipe or heredoc.

examples:
  radius create src/utils.ts --content "export const PI = 3.14;"

  # Multiline content via stdin:
  echo 'export function greet(name: string) {
    return \`Hello, \${name}!\`;
  }' | radius create src/greet.ts --stdin

  # Using heredoc:
  radius create src/config.ts --stdin << 'EOF'
  export const config = {
    apiUrl: "https://api.example.com",
    timeout: 5000,
  };
  EOF`,
    buildRequest: (args, cwd, stdin) => {
      const file = args[0];
      if (!file) {
        throw "usage: radius create <file> [--content <text> | --stdin]";
      }
      const absFile = resolve(cwd, file);
      const parsed = parseArgs(args.slice(1));

      // --stdin モード: --content の代わりに stdin を使用
      let content = parsed.content as string | undefined;
      if (parsed.stdin !== undefined) {
        if (!stdin) {
          throw "error: --stdin specified but no input provided";
        }
        if (content !== undefined) {
          throw "usage: cannot use both --content and --stdin";
        }
        content = stdin;
      }

      return {
        command: "create",
        args: { file: absFile, content },
      };
    },
  },
  {
    name: "insert",
    description: "指定行への文字列挿入",
    usage: "radius insert <file> --line <N> [--text <text> | --stdin]",
    help: `usage: radius insert <file> --line <N> --text <text> [--tag T]
       radius insert <file> --line <N> --stdin [--tag T]

Insert text at a specific line number.

options:
  --line <N>      Line number to insert at (1-indexed, required)
  --text <text>   Text to insert (required unless --stdin)
  --stdin         Read text from stdin (for multiline content)
  --tag <tag>     Session tag from previous command output

examples:
  radius insert src/api.ts --line 10 --text "// TODO: implement"

  # Multiline insertion via stdin:
  echo 'function newMethod() {
    return "implemented";
  }' | radius insert src/api.ts --line 15 --stdin`,
    buildRequest: (args, cwd, stdin) => {
      const file = args[0];
      const parsed = parseArgs(args.slice(1));

      // --stdin モード: --text の代わりに stdin を使用
      let text = parsed.text as string | undefined;
      if (parsed.stdin !== undefined) {
        if (!stdin) {
          throw "error: --stdin specified but no input provided";
        }
        if (text !== undefined) {
          throw "usage: cannot use both --text and --stdin";
        }
        text = stdin;
      }

      if (!file || parsed.line === undefined || text === undefined) {
        throw "usage: radius insert <file> --line <N> [--text <text> | --stdin]";
      }
      const absFile = resolve(cwd, file);
      return {
        command: "insert",
        args: { file: absFile, line: parsed.line, text },
      };
    },
  },
  {
    name: "lsp",
    description: "LSPサーバ管理",
    usage: "radius lsp <list>",
    help: `usage: radius lsp <list>

Manage LSP (Language Server Protocol) servers.

subcommands:
  list    Show registered LSP servers and their sources

examples:
  radius lsp list`,
    buildRequest: (args, _cwd, _stdin) => {
      const subcommand = args[0];
      if (subcommand === "list") {
        return {
          command: "lsp-list",
          args: {},
        };
      } else {
        throw `unknown lsp subcommand: ${subcommand}`;
      }
    },
  },
  {
    name: "graph",
    description: "Mermaid グラフ生成",
    usage: "radius graph <imports|refs|calls> <file> [symbol/function] [options]",
    help: `usage: radius graph imports <file> [--depth N] [--tag T]
       radius graph refs <file> <symbol> [--tag T]
       radius graph calls <file> <function> [--tag T]

Generate Mermaid diagrams for code visualization.

subcommands:
  imports   Generate module dependency graph
  refs      Generate variable reference graph
  calls     Generate function call hierarchy

options:
  --depth <N>   Maximum depth for imports graph (default: 1)
  --tag <tag>   Session tag from previous command output

examples:
  radius graph imports src/api.ts                # Direct imports
  radius graph imports src/api.ts --depth 3      # Up to 3 levels deep
  radius graph refs src/api.ts httpClient        # Variable references
  radius graph calls src/api.ts fetchData        # Call hierarchy`,
    buildRequest: (args, cwd, _stdin) => {
      if (args.length < 2) {
        throw "usage: radius graph <imports|refs|calls> <file> [symbol/function] [options]";
      }
      const subcommand = args[0];
      const file = args[1];
      const absFile = resolve(cwd, file);

      const result: Record<string, unknown> = {
        subcommand,
        file: absFile,
      };

      // サブコマンドによって第3引数の扱いが異なる
      if (subcommand === "refs" && args.length >= 3) {
        result.symbol = args[2];
        // 残りのオプションをパース
        const parsed = parseArgs(args.slice(3));
        Object.assign(result, parsed);
      } else if (subcommand === "calls" && args.length >= 3) {
        result.function = args[2];
        // 残りのオプションをパース
        const parsed = parseArgs(args.slice(3));
        Object.assign(result, parsed);
      } else {
        // imports の場合はオプションのみ
        const parsed = parseArgs(args.slice(2));
        Object.assign(result, parsed);
      }

      return {
        command: "graph",
        args: result,
      };
    },
  },
  {
    name: "grep",
    description: "パターン検索",
    usage: "radius grep <file-or-dir> --pattern <query> [--regex] [--ignore-case] [--max-results N]",
    help: `usage: radius grep <file-or-dir> --pattern <query> [options] [--tag T]

Search for patterns in files.

options:
  --pattern <query>    Search pattern (required)
  --regex              Treat pattern as regular expression
  --ignore-case        Case-insensitive search
  --max-results <N>    Maximum number of results to return
  --tag <tag>          Session tag from previous command output

examples:
  radius grep src/ --pattern "TODO"
  radius grep src/api.ts --pattern "fetch.*Error" --regex
  radius grep src/ --pattern "config" --ignore-case --max-results 10`,
    buildRequest: (args, cwd, _stdin) => {
      const target = args[0];
      if (!target) {
        throw "usage: radius grep <file-or-dir> --pattern <query> [--regex] [--ignore-case] [--max-results N]";
      }
      const absTarget = resolve(cwd, target);
      const parsed = parseArgs(args.slice(1));
      if (!parsed.pattern) {
        throw "usage: radius grep <file-or-dir> --pattern <query> [--regex] [--ignore-case] [--max-results N]";
      }
      return {
        command: "grep",
        args: {
          target: absTarget,
          pattern: parsed.pattern,
          regex: parsed.regex,
          "ignore-case": parsed["ignore-case"],
          "max-results": parsed["max-results"],
        },
      };
    },
  },
  {
    name: "replace",
    description: "単一ファイルのパターン一括置換",
    usage: "radius replace <file> --pattern <query> --replacement <string> [--regex] [--ignore-case] [--max N] [--stdin]",
    help: `usage: radius replace <file> --pattern <query> --replacement <string> [options] [--tag T]
       radius replace <file> --stdin [--tag T]

Replace patterns in a single file.

options:
  --pattern <query>       Search pattern (required unless --stdin)
  --replacement <string>  Replacement text (required unless --stdin)
  --regex                 Treat pattern as regular expression
  --ignore-case           Case-insensitive matching
  --max <N>               Maximum replacements to make
  --reason <text>         Explanation (required if conflicting with other agents)
  --stdin                 Read JSON parameters from stdin
  --tag <tag>             Session tag from previous command output

stdin mode (JSON format):
  {"pattern": "...", "replacement": "...", "regex": true, "ignoreCase": true}

examples:
  radius replace src/api.ts --pattern "oldName" --replacement "newName"
  radius replace src/api.ts --pattern "console\\.log" --replacement "logger.info" --regex

  # Multiline via stdin:
  echo '{"pattern": "function old", "replacement": "function new"}' | radius replace src/api.ts --stdin`,
    buildRequest: (args, cwd, stdin) => {
      const file = args[0];
      if (!file) {
        throw "usage: radius replace <file> --pattern <query> --replacement <string> [--regex] [--ignore-case] [--max N] [--stdin]";
      }
      const absFile = resolve(cwd, file);
      const parsed = parseArgs(args.slice(1));

      // --stdin モード: JSON形式で全パラメータを受け取る
      if (parsed.stdin !== undefined) {
        return {
          command: "replace",
          args: {
            file: absFile,
            stdin: true,
          },
          stdin,
        };
      }

      if (!parsed.pattern || parsed.replacement === undefined) {
        throw "usage: radius replace <file> --pattern <query> --replacement <string> [--regex] [--ignore-case] [--max N]";
      }

      return {
        command: "replace",
        args: {
          file: absFile,
          pattern: parsed.pattern,
          replacement: parsed.replacement,
          regex: parsed.regex,
          "ignore-case": parsed["ignore-case"],
          max: parsed.max,
          reason: parsed.reason,
        },
      };
    },
  },
  {
    name: "replace-all",
    description: "複数ファイルのパターン一括置換",
    usage: "radius replace-all <dir> --pattern <query> --replacement <string> [--regex] [--ignore-case] [--include <glob>] [--exclude <glob>] [--stdin]",
    help: `usage: radius replace-all <dir> --pattern <query> --replacement <string> [options] [--tag T]
       radius replace-all <dir> --stdin [--tag T]

Replace patterns across multiple files.

options:
  --pattern <query>       Search pattern (required unless --stdin)
  --replacement <string>  Replacement text (required unless --stdin)
  --regex                 Treat pattern as regular expression
  --ignore-case           Case-insensitive matching
  --include <glob>        Include only files matching glob (e.g., "*.ts")
  --exclude <glob>        Exclude files matching glob (e.g., "node_modules/**")
  --reason <text>         Explanation (required if conflicting with other agents)
  --stdin                 Read JSON parameters from stdin
  --tag <tag>             Session tag from previous command output

stdin mode (JSON format):
  {"pattern": "...", "replacement": "...", "include": "*.ts", "exclude": "test/**"}

examples:
  radius replace-all src/ --pattern "oldApi" --replacement "newApi" --include "*.ts"
  radius replace-all . --pattern "v1" --replacement "v2" --exclude "node_modules/**"`,
    buildRequest: (args, cwd, stdin) => {
      const dir = args[0];
      if (!dir) {
        throw "usage: radius replace-all <dir> --pattern <query> --replacement <string> [--regex] [--ignore-case] [--include <glob>] [--exclude <glob>]";
      }
      const absDir = resolve(cwd, dir);
      const parsed = parseArgs(args.slice(1));

      // --stdin モード: JSON形式で全パラメータを受け取る
      if (parsed.stdin !== undefined) {
        return {
          command: "replace-all",
          args: {
            dir: absDir,
            stdin: true,
          },
          stdin,
        };
      }

      if (!parsed.pattern || parsed.replacement === undefined) {
        throw "usage: radius replace-all <dir> --pattern <query> --replacement <string> [--regex] [--ignore-case] [--include <glob>] [--exclude <glob>]";
      }

      return {
        command: "replace-all",
        args: {
          dir: absDir,
          pattern: parsed.pattern,
          replacement: parsed.replacement,
          regex: parsed.regex,
          "ignore-case": parsed["ignore-case"],
          include: parsed.include,
          exclude: parsed.exclude,
          reason: parsed.reason,
        },
      };
    },
  },
  {
    name: "accept-change",
    description: "コンフリクトを受け入れる",
    usage: "radius accept-change --conflict <conflict-id>",
    help: `usage: radius accept-change --conflict <conflict-id> [--tag T]

Accept another agent's conflicting change.

options:
  --conflict <id>  Conflict ID from notification (required)
  --tag <tag>      Session tag from previous command output

Use this when another agent has modified code you also edited, and you
want to acknowledge their change is acceptable.

examples:
  radius accept-change --conflict conflict-123456 --tag abc1-XXXXXXXX`,
    buildRequest: (args, cwd, _stdin) => {
      const parsed = parseArgs(args);
      if (!parsed.conflict) {
        throw "usage: radius accept-change --conflict <conflict-id>";
      }
      return {
        command: "accept-change",
        args: {
          conflict: parsed.conflict,
          cwd,
        },
      };
    },
  },
  {
    name: "challenge-change",
    description: "コンフリクトに challenge を送る",
    usage: "radius challenge-change --conflict <conflict-id> --reason <reason>",
    help: `usage: radius challenge-change --conflict <conflict-id> --reason <reason> [--tag T]

Challenge another agent's conflicting change.

options:
  --conflict <id>    Conflict ID from notification (required)
  --reason <text>    Explanation why their change is problematic (required)
  --tag <tag>        Session tag from previous command output

Use this when another agent has modified code you also edited, and you
want to dispute their change with an explanation.

examples:
  radius challenge-change --conflict conflict-123456 --reason "breaks existing tests" --tag abc1-XXXXXXXX`,
    buildRequest: (args, cwd, _stdin) => {
      const parsed = parseArgs(args);
      if (!parsed.conflict || !parsed.reason) {
        throw "usage: radius challenge-change --conflict <conflict-id> --reason <reason>";
      }
      return {
        command: "challenge-change",
        args: {
          conflict: parsed.conflict,
          reason: parsed.reason,
          cwd,
        },
      };
    },
  },
  {
    name: "list-notifications",
    description: "チェーン宛ての未読通知を表示",
    usage: "radius list-notifications",
    help: `usage: radius list-notifications [--tag T]

List pending notifications for your edit chain.

options:
  --tag <tag>   Session tag from previous command output

Notifications are sent when other agents modify code that overlaps with
your edits. Use accept-change or challenge-change to respond.

examples:
  radius list-notifications --tag abc1-XXXXXXXX`,
    buildRequest: (args, cwd, _stdin) => {
      return {
        command: "list-notifications",
        args: {
          cwd,
        },
      };
    },
  },
  // Phase 17: Code Actions / Format
  {
    name: "fix",
    description: "LSPコードアクションの適用",
    usage: "radius fix <file> [--list] [--line N] [--id N]",
    help: `usage: radius fix <file> --list [--tag T]
       radius fix <file> [--line N] [--id N] [--tag T]

Apply LSP code actions (quick fixes, refactors) to a file.

options:
  --list         List available code actions without applying
  --line <N>     Only show/apply actions for a specific line
  --id <N>       Apply a specific action by its id (from --list)
  --tag <tag>    Session tag from previous command output

examples:
  radius fix src/api.ts --list
  radius fix src/api.ts --list --line 5
  radius fix src/api.ts
  radius fix src/api.ts --id 1`,
    buildRequest: (args, cwd, _stdin) => {
      const file = args[0];
      if (!file) {
        throw "usage: radius fix <file> [--list] [--line N] [--id N]";
      }
      const absFile = resolve(cwd, file);
      const parsed = parseArgs(args.slice(1));
      return {
        command: "fix",
        args: {
          file: absFile,
          list: parsed.list,
          line: parsed.line,
          id: parsed.id,
        },
      };
    },
  },
  {
    name: "format",
    description: "LSPフォーマットの適用",
    usage: "radius format <file>",
    help: `usage: radius format <file> [--tag T]

Apply LSP formatting to a file.

options:
  --tag <tag>   Session tag from previous command output

examples:
  radius format src/api.ts
  radius format src/utils.ts --tag abc1-XXXXXXXX`,
    buildRequest: (args, cwd, _stdin) => {
      const file = args[0];
      if (!file) {
        throw "usage: radius format <file>";
      }
      const absFile = resolve(cwd, file);
      return {
        command: "format",
        args: { file: absFile },
      };
    },
  },
  // Phase 18: LLM可読ビュー
  {
    name: "outline",
    description: "ファイルのシンボルツリー表示",
    usage: "radius outline <file>",
    help: `usage: radius outline <file> [--tag T]

Display the symbol tree (functions, classes, variables) of a file.

options:
  --tag <tag>   Session tag from previous command output

examples:
  radius outline src/api.ts
  radius outline src/utils.ts`,
    buildRequest: (args, cwd, _stdin) => {
      const file = args[0];
      if (!file) {
        throw "usage: radius outline <file>";
      }
      const absFile = resolve(cwd, file);
      return {
        command: "outline",
        args: { file: absFile },
      };
    },
  },
  {
    name: "hover",
    description: "指定位置の型情報を表示",
    usage: "radius hover <file> --line N --col N",
    help: `usage: radius hover <file> --line <N> --col <N> [--tag T]

Show type and documentation info at a specific position.

options:
  --line <N>    Line number (1-indexed, required)
  --col <N>     Column number (1-indexed, required)
  --tag <tag>   Session tag from previous command output

examples:
  radius hover src/api.ts --line 5 --col 10
  radius hover src/utils.ts --line 12 --col 3`,
    buildRequest: (args, cwd, _stdin) => {
      const file = args[0];
      const parsed = parseArgs(args.slice(1));
      if (!file || !parsed.line || !parsed.col) {
        throw "usage: radius hover <file> --line <N> --col <N>";
      }
      const absFile = resolve(cwd, file);
      return {
        command: "hover",
        args: { file: absFile, line: parsed.line, col: parsed.col },
      };
    },
  },
  {
    name: "problems",
    description: "診断情報の表示",
    usage: "radius problems [<file-or-dir>]",
    help: `usage: radius problems [<file-or-dir>] [--tag T]

Show diagnostics (errors, warnings) for files.

options:
  --tag <tag>   Session tag from previous command output

If no path is given, shows diagnostics for the current directory.

examples:
  radius problems src/api.ts
  radius problems src/
  radius problems`,
    buildRequest: (args, cwd, _stdin) => {
      const path = args[0];
      return {
        command: "problems",
        args: { path: path ? resolve(cwd, path) : undefined },
      };
    },
  },
  {
    name: "typehierarchy",
    description: "型階層の表示",
    usage: "radius typehierarchy <file> --symbol <name>",
    help: `usage: radius typehierarchy <file> --symbol <name> [--tag T]

Show type hierarchy (supertypes and subtypes) for a class or interface.

options:
  --symbol <name>  Class or interface name (required)
  --tag <tag>      Session tag from previous command output

examples:
  radius typehierarchy src/services.ts --symbol UserService
  radius typehierarchy src/models.ts --symbol BaseModel`,
    buildRequest: (args, cwd, _stdin) => {
      const file = args[0];
      const parsed = parseArgs(args.slice(1));
      if (!file || !parsed.symbol) {
        throw "usage: radius typehierarchy <file> --symbol <name>";
      }
      const absFile = resolve(cwd, file);
      return {
        command: "typehierarchy",
        args: { file: absFile, symbol: parsed.symbol },
      };
    },
  },
  {
    name: "diff",
    description: "Git差分の表示",
    usage: "radius diff <file> [--ref <git-ref>]",
    help: `usage: radius diff <file> [--ref <git-ref>] [--tag T]

Show git diff for a file.

options:
  --ref <ref>   Git reference to compare against (e.g., HEAD~1, main)
  --tag <tag>   Session tag from previous command output

If --ref is not specified, shows unstaged changes.

examples:
  radius diff src/api.ts
  radius diff src/api.ts --ref HEAD~1
  radius diff src/api.ts --ref main`,
    buildRequest: (args, cwd, _stdin) => {
      const file = args[0];
      if (!file) {
        throw "usage: radius diff <file> [--ref <git-ref>]";
      }
      const absFile = resolve(cwd, file);
      const parsed = parseArgs(args.slice(1));
      return {
        command: "diff",
        args: { file: absFile, ref: parsed.ref },
      };
    },
  },
  {
    name: "codelens",
    description: "コードレンズの表示",
    usage: "radius codelens <file>",
    help: `usage: radius codelens <file> [--tag T]

Show code lenses (references, implementations) for a file.

options:
  --tag <tag>   Session tag from previous command output

examples:
  radius codelens src/api.ts
  radius codelens src/models.ts`,
    buildRequest: (args, cwd, _stdin) => {
      const file = args[0];
      if (!file) {
        throw "usage: radius codelens <file>";
      }
      const absFile = resolve(cwd, file);
      return {
        command: "codelens",
        args: { file: absFile },
      };
    },
  },
  // Phase 19: Language Configuration / Snippets / Semantic Tokens / Tasks
  {
    name: "comment",
    description: "行/ブロックコメントの切り替え",
    usage: "radius comment <file> --line <N> | --range <start>:<end> [--uncomment]",
    help: `usage: radius comment <file> --line <N> [--uncomment] [--tag T]
       radius comment <file> --range <start>:<end> [--uncomment] [--tag T]

Toggle line or block comments in a file.

options:
  --line <N>              Line number to comment (1-indexed)
  --range <start>:<end>   Line range to comment (1-indexed, inclusive)
  --uncomment             Remove comments instead of adding
  --tag <tag>             Session tag from previous command output

examples:
  radius comment src/api.ts --line 10
  radius comment src/api.ts --range 5:10
  radius comment src/api.ts --line 10 --uncomment`,
    buildRequest: (args, cwd, _stdin) => {
      const file = args[0];
      const parsed = parseArgs(args.slice(1));
      if (!file || (!parsed.line && !parsed.range)) {
        throw "usage: radius comment <file> --line <N> | --range <start>:<end>";
      }
      const absFile = resolve(cwd, file);
      return {
        command: "comment",
        args: {
          file: absFile,
          line: parsed.line,
          range: parsed.range,
          uncomment: parsed.uncomment,
        },
      };
    },
  },
  {
    name: "snippet",
    description: "スニペットの挿入/一覧表示",
    usage: "radius snippet <file> --name <name> --line <N> | --list [--language <lang>]",
    help: `usage: radius snippet <file> --name <name> --line <N> [--tag T]
       radius snippet --list [--language <lang>]

Insert a snippet or list available snippets.

options:
  --name <name>       Snippet name to insert (required for insertion)
  --line <N>          Line number to insert at (1-indexed, required for insertion)
  --list              List available snippets
  --language <lang>   Language for snippet list (default: typescript)
  --tag <tag>         Session tag from previous command output

examples:
  radius snippet --list
  radius snippet --list --language javascript
  radius snippet src/api.ts --name for --line 10
  radius snippet src/api.ts --name function --line 5`,
    buildRequest: (args, cwd, _stdin) => {
      const parsed = parseArgs(args);
      if (parsed.list) {
        return {
          command: "snippet",
          args: { list: true, language: parsed.language },
        };
      }
      const file = args[0];
      if (!file || !parsed.name || !parsed.line) {
        throw "usage: radius snippet <file> --name <name> --line <N> | --list [--language <lang>]";
      }
      const absFile = resolve(cwd, file);
      return {
        command: "snippet",
        args: {
          file: absFile,
          name: parsed.name,
          line: parsed.line,
        },
      };
    },
  },
  {
    name: "tokens",
    description: "セマンティックトークンの表示",
    usage: "radius tokens <file> [--range <start>:<end>]",
    help: `usage: radius tokens <file> [--range <start>:<end>] [--tag T]

Display semantic tokens for a file.

options:
  --range <start>:<end>   Line range to show tokens for (1-indexed)
  --tag <tag>             Session tag from previous command output

examples:
  radius tokens src/api.ts
  radius tokens src/api.ts --range 5:10`,
    buildRequest: (args, cwd, _stdin) => {
      const file = args[0];
      if (!file) {
        throw "usage: radius tokens <file> [--range <start>:<end>]";
      }
      const absFile = resolve(cwd, file);
      const parsed = parseArgs(args.slice(1));
      return {
        command: "tokens",
        args: { file: absFile, range: parsed.range },
      };
    },
  },
  {
    name: "task",
    description: "タスクの一覧表示/実行",
    usage: "radius task <list|run> [name]",
    help: `usage: radius task list [--tag T]
       radius task run <name> [--tag T]

List and run tasks from .vscode/tasks.json.

subcommands:
  list              List available tasks
  run <name>        Run a task by name

options:
  --tag <tag>       Session tag from previous command output

examples:
  radius task list
  radius task run build
  radius task run test`,
    buildRequest: (args, cwd, _stdin) => {
      const subcommand = args[0];
      if (!subcommand || (subcommand !== "list" && subcommand !== "run")) {
        throw "usage: radius task <list|run> [name]";
      }
      if (subcommand === "run" && !args[1]) {
        throw "usage: radius task run <name>";
      }
      return {
        command: "task",
        args: {
          subcommand,
          name: args[1],
        },
      };
    },
  },
];

/**
 * コマンド名からコマンド定義を取得する。
 */
export function findCommand(name: string): CommandDef | undefined {
  return commands.find((cmd) => cmd.name === name);
}

/**
 * usage メッセージを生成する。
 */
export function generateUsage(): string {
  const lines = [
    "usage: radius <command> [options]",
    "",
    "commands:",
  ];
  for (const cmd of commands) {
    const padding = " ".repeat(Math.max(0, 50 - cmd.name.length - cmd.description.length));
    lines.push(`  ${cmd.name}${padding}${cmd.description}`);
  }
  return lines.join("\n");
}
