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
 * コマンド成功時に表示すべきtipを返す。
 * 不要な場合は null を返す。
 */
export function getSuccessTip(
  command: string,
  args: string[],
  stdout: string
): string | null {
  switch (command) {
    case "create":
      if (!args.includes("--content") && !args.includes("--stdin")) {
        return 'tip: pass --content "code" to create a file with content in one step';
      }
      break;
    case "view":
      if (stdout.includes("0 items") || stdout.includes("empty directory")) {
        return "tip: directory is empty. use radius create <file> to add files";
      }
      break;
    case "grep":
      if (stdout.includes("0 matches") || stdout.includes("no matches")) {
        return "tip: try --ignore-case or --regex for broader matching";
      }
      break;
  }
  return null;
}
