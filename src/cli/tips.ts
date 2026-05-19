/**
 * Context Tips
 *
 * コマンドがエラーまたは空結果を返した時に、文脈に応じたtipsを表示する。
 */

/**
 * コマンド名とエラーメッセージから、表示すべきtipを返す。
 * tipが不要な場合は null を返す。
 */
export function getTip(command: string, errorMessage: string): string | null {
  // コマンド固有のtips
  switch (command) {
    case "create":
      if (/--content|--stdin/i.test(errorMessage)) {
        return 'tip: radius create <file> --content "code" or pipe with --stdin';
      }
      break;
    case "view":
      if (/argument|usage|file.*required/i.test(errorMessage)) {
        return "tip: radius view <file> or radius view <dir> for directory listing";
      }
      break;
    case "str-replace":
      if (/no match|0 match/i.test(errorMessage)) {
        return 'tip: use radius grep <file> --pattern "text" to search first';
      }
      break;
    case "fix":
      if (/no.*action|0 action/i.test(errorMessage)) {
        return "tip: no code actions available. check radius problems <file> for diagnostics";
      }
      break;
    case "grep":
      if (/no match|0 match/i.test(errorMessage)) {
        return "tip: try --ignore-case or --regex for broader matching";
      }
      break;
    case "undo":
      if (/nothing to undo|no history/i.test(errorMessage)) {
        return "tip: undo history is per-session. check your --tag is correct";
      }
      break;
  }

  // 汎用tips（他のtipsが該当しなかった場合）
  return `tip: run radius ${command} --help for usage details`;
}

/**
 * 成功時に表示すべきtipを返す。
 * コマンド実行結果が成功だが、ユーザーに補足情報を伝えたい場合に使用。
 */
export function getSuccessTip(command: string, output: string): string | null {
  switch (command) {
    case "create":
      // --content なしで作成された場合（空ファイルまたは空行のみ）
      if (output.includes("created:")) {
        // 行番号の後が空または空白のみの場合
        if (output.match(/^\s*\d+:\s*$/m)) {
          return 'tip: created empty file. add content with radius insert or --content flag';
        }
      }
      break;
    case "view":
      // 空ディレクトリの場合（出力が空または空白のみ）
      if (output.trim() === "") {
        return "tip: empty directory. use radius create <file> to add files";
      }
      break;
    case "grep":
      // 0マッチの場合
      if (output.includes("matches: 0") || output.includes("no matches found")) {
        return "tip: try --ignore-case or --regex for broader matching";
      }
      break;
  }

  return null;
}
