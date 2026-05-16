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

  return request;
}

/** コマンド定義一覧。 */
export const commands: CommandDef[] = [
  {
    name: "ping",
    description: "デーモンとの疎通確認",
    usage: "radius ping",
    supportsTag: false,
    buildRequest: (_args, _cwd, _stdin) => ({ command: "ping", args: {} }),
  },
  {
    name: "read-var",
    description: "変数の参照箇所を取得",
    usage: "radius read-var <file> --var <name>",
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
    buildRequest: (args, cwd, _stdin) => {
      return { command: "undo", args: { cwd } };
    },
  },
  {
    name: "redo",
    description: "取り消した操作を再適用",
    usage: "radius redo",
    buildRequest: (args, cwd, _stdin) => {
      return { command: "redo", args: { cwd } };
    },
  },
  {
    name: "solve-conflict",
    description: "コンフリクトの表示と解決",
    usage: "radius solve-conflict <file> [--accept ours|theirs] [--id <N>] [--content <text>]",
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
    buildRequest: (args, cwd, _stdin) => {
      const path = args[0];
      if (!path) {
        throw "usage: radius view <path> [--range <start>:<end>]";
      }
      const absPath = resolve(cwd, path);
      const parsed = parseArgs(args.slice(1));
      return {
        command: "view",
        args: { path: absPath, range: parsed.range },
      };
    },
  },
  {
    name: "str-replace",
    description: "文字列の完全一致置換",
    usage: "radius str-replace <file> --old <text> --new <text> | --stdin [--old|--new]",
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
        args: { file: absFile, old: oldText, new: newText },
      };
    },
  },
  {
    name: "create",
    description: "新規ファイルの作成",
    usage: "radius create <file> [--content <text> | --stdin]",
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
