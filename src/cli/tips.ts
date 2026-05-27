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
  switch (command) {
    case "create":
      if (/already exists/i.test(errorMessage)) {
        return "tip: file exists — use --force to overwrite, or radius view <file> to inspect first";
      }
      if (/--content|--stdin/i.test(errorMessage)) {
        return 'tip: radius create <file> --content "code" or pipe with --stdin';
      }
      if (/not a file path/i.test(errorMessage)) {
        return "tip: run radius create --help (not radius create --help as a filename)";
      }
      break;
    case "create-all":
      if (/already exists/i.test(errorMessage)) {
        return "tip: use create-all --force --stdin to overwrite existing files in bulk";
      }
      break;
    case "view":
      if (/argument|usage|file.*required/i.test(errorMessage)) {
        return "tip: radius view <file> or radius view <dir> for directory listing";
      }
      break;
    case "str-replace":
      if (/no match/i.test(errorMessage)) {
        return "tip: run radius view <file> to copy exact text; check whitespace and newlines";
      }
      if (/multiple matches/i.test(errorMessage)) {
        return "tip: add more surrounding lines to --old, or split into smaller replacements";
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
      if (/nothing to undo|no history|--tag is required/i.test(errorMessage)) {
        return "tip: undo is per-session. RADIUS_SESSION is set automatically; no --tag needed";
      }
      break;
  }

  return `tip: run radius ${command} --help for usage details`;
}

/**
 * 成功時に表示すべきtipを返す。
 */
export function getSuccessTip(command: string, output: string): string | null {
  switch (command) {
    case "create":
      if (output.includes("created:")) {
        if (output.match(/^\s*\d+:\s*$/m)) {
          return 'tip: created empty file. add content with radius insert or --content flag';
        }
      }
      break;
    case "view":
      if (output.trim() === "") {
        return "tip: empty directory. use radius create <file> or create-all --stdin for many files";
      }
      break;
    case "grep":
      if (output.includes("matches: 0") || output.includes("no matches found")) {
        return "tip: try --ignore-case or --regex for broader matching";
      }
      break;
  }

  return null;
}
