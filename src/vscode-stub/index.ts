/**
 * VSCode API スタブ
 *
 * Phase 4: 全モジュールを vscode オブジェクトとして統合 export
 */

import * as languages from "./languages";
import * as commands from "./commands";
import * as workspace from "./workspace";
import * as window from "./window";
import * as debug from "./debug";
import * as env from "./env";

/**
 * vscode API オブジェクト
 */
export { languages, commands, workspace, window, debug, env };

/**
 * デフォルト export（require('vscode') 互換）
 */
export default {
  languages,
  commands,
  workspace,
  window,
  debug,
  env,
};
