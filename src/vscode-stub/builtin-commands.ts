/**
 * VSCode Built-in Commands Mapping
 *
 * editor.action.* および workbench.action.* コマンドを
 * 既存の radius コマンドにマッピングする。
 */

export interface CommandMapping {
  /** VSCode コマンドID */
  id: string;
  /** radius コマンド名 */
  radiusCommand: string;
  /** 引数変換関数 */
  transformArgs?: (args: any[]) => string[];
  /** 説明 */
  description: string;
}

/**
 * Built-in コマンドマッピング定義
 */
export const builtinCommands: CommandMapping[] = [
  // === editor.action.* ===
  {
    id: "editor.action.formatDocument",
    radiusCommand: "format",
    transformArgs: (args) => [args[0]], // [file]
    description: "Format document",
  },
  {
    id: "editor.action.rename",
    radiusCommand: "modify-var",
    transformArgs: (args) => [args[0], "--from", args[1], "--to", args[2]], // [file, --from, old, --to, new]
    description: "Rename symbol",
  },
  {
    id: "editor.action.organizeImports",
    radiusCommand: "format", // TODO: 専用コマンド実装時に変更
    transformArgs: (args) => [args[0], "--organize-imports"],
    description: "Organize imports",
  },
  {
    id: "editor.action.goToDefinition",
    radiusCommand: "hover", // TODO: 専用コマンド実装時に変更
    transformArgs: (args) => [args[0], "--line", args[1], "--col", args[2]],
    description: "Go to definition",
  },
  {
    id: "editor.action.findAllReferences",
    radiusCommand: "read-var",
    transformArgs: (args) => [args[0], "--var", args[1]],
    description: "Find all references",
  },
  {
    id: "editor.action.commentLine",
    radiusCommand: "insert", // TODO: 専用コマンド実装時に変更
    transformArgs: (args) => [args[0], "--line", args[1], "--text", "// "],
    description: "Comment line",
  },
  {
    id: "editor.action.triggerSuggest",
    radiusCommand: "hover", // TODO: 補完専用コマンド実装時に変更
    transformArgs: (args) => [args[0], "--line", args[1], "--col", args[2]],
    description: "Trigger suggest",
  },

  // === workbench.action.* ===
  {
    id: "workbench.action.gotoSymbol",
    radiusCommand: "outline",
    transformArgs: (args) => [args[0]],
    description: "Go to symbol",
  },
  {
    id: "workbench.action.quickOpen",
    radiusCommand: "view", // TODO: ファイル一覧専用コマンド実装時に変更
    transformArgs: (args) => ["."],
    description: "Quick open files",
  },
];

/**
 * コマンドIDからマッピングを取得
 */
export function getCommandMapping(commandId: string): CommandMapping | undefined {
  return builtinCommands.find((cmd) => cmd.id === commandId);
}

/**
 * 全てのコマンドID一覧を取得
 */
export function getAllCommandIds(): string[] {
  return builtinCommands.map((cmd) => cmd.id);
}
