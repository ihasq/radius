/**
 * Phase 15: 検索・置換エンジン
 *
 * grep, replace, replace-all コマンドの共通エンジン。
 * リテラル検索と正規表現検索を統一的に処理する。
 */

export interface SearchOptions {
  pattern: string;
  isRegex: boolean;
  ignoreCase: boolean;
}

export interface SearchMatch {
  /** マッチした行番号（1-indexed） */
  line: number;
  /** マッチした列番号（1-indexed） */
  column: number;
  /** マッチした文字列 */
  matchText: string;
  /** マッチを含む行の全文 */
  lineContent: string;
}

export interface ReplaceResult {
  /** 置換後のファイル全文 */
  newContent: string;
  /** 置換が行われた箇所 */
  matches: SearchMatch[];
  /** 置換された数 */
  count: number;
}

/**
 * 正規表現の特殊文字をエスケープする。
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * SearchOptions からRegExpを構築する。
 * isRegex が false の場合、pattern をエスケープしてリテラル検索にする。
 */
export function buildRegExp(opts: SearchOptions, globalFlag: boolean = true): RegExp {
  const pattern = opts.isRegex ? opts.pattern : escapeRegex(opts.pattern);
  let flags = globalFlag ? "g" : "";
  if (opts.ignoreCase) {
    flags += "i";
  }
  return new RegExp(pattern, flags);
}

/**
 * ファイル内容から全マッチを検索する。
 */
export function searchInContent(
  content: string,
  opts: SearchOptions,
  maxResults?: number
): SearchMatch[] {
  const regex = buildRegExp(opts);
  const lines = content.split("\n");
  const matches: SearchMatch[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineContent = lines[lineIdx];
    let match: RegExpExecArray | null;

    // 同じ行内で複数マッチする可能性があるため、execでループ
    while ((match = regex.exec(lineContent)) !== null) {
      matches.push({
        line: lineIdx + 1,
        column: match.index + 1,
        matchText: match[0],
        lineContent,
      });

      if (maxResults && matches.length >= maxResults) {
        return matches;
      }

      // 空文字列マッチによる無限ループを防ぐ
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }
  }

  return matches;
}

/**
 * ファイル内容のマッチを置換する。
 * maxReplacements が指定されていれば、先頭からN件のみ置換する。
 */
export function replaceInContent(
  content: string,
  opts: SearchOptions,
  replacement: string,
  maxReplacements?: number
): ReplaceResult {
  // まず全マッチを検索
  const matches = searchInContent(content, opts, maxReplacements);

  if (matches.length === 0) {
    return {
      newContent: content,
      matches: [],
      count: 0,
    };
  }

  // 実際に置換する数
  const replaceCount = maxReplacements ? Math.min(matches.length, maxReplacements) : matches.length;

  // 置換実行
  // --regex 未使用時は $ をエスケープしてリテラルとして扱う
  const actualReplacement = opts.isRegex ? replacement : replacement.replace(/\$/g, "$$$$");

  const regex = buildRegExp(opts);
  let newContent = content;
  let replaced = 0;

  newContent = newContent.replace(regex, (match) => {
    if (replaced < replaceCount) {
      replaced++;
      return actualReplacement;
    }
    return match;
  });

  return {
    newContent,
    matches: matches.slice(0, replaceCount),
    count: replaceCount,
  };
}
