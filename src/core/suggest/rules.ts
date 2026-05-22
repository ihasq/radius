/**
 * Command Suggestion Rules
 *
 * Each rule defines:
 * - match: predicate to determine if rule applies
 * - suggest: function to generate command suggestions
 */

export interface SuggestRule {
  match: (command: string, output: string) => boolean;
  suggest: (file: string, tag: string, output: string) => string[];
}

export const SUGGEST_RULES: SuggestRule[] = [
  // Rule 1: Diagnostics with errors → suggest fix, str-replace
  {
    match: (_cmd, out) => (out.includes("❌") || /\d+ error/.test(out)) && !out.includes("0 errors"),
    suggest: (file, tag) => [
      `radius fix ${file} --tag ${tag}`,
      `radius str-replace ${file} --old "..." --new "..." --tag ${tag}`,
    ],
  },

  // Rule 2: After write commands with 0 errors → suggest problems, view
  {
    match: (cmd, out) =>
      ["str-replace", "insert", "create", "create-all"].some((c) =>
        cmd.includes(c)
      ) &&
      (out.includes("0 errors") || out.includes("(clean)")),
    suggest: (file, tag) => [
      `radius problems ${file} --tag ${tag}`,
      `radius view ${file} --tag ${tag}`,
    ],
  },

  // Rule 3: outline → hover (with line number extraction), read-var
  {
    match: (cmd) => cmd === "outline",
    suggest: (file, tag, out) => {
      const suggestions: string[] = [];

      // Extract first symbol line number
      const lineMatch = out.match(/\[line (\d+)\]/);
      const firstLine = lineMatch ? lineMatch[1] : "1";
      suggestions.push(
        `radius hover ${file} --line ${firstLine} --col 1 --tag ${tag}`
      );

      // Extract first export symbol name
      const varMatch = out.match(
        /export (?:function|variable|const|class) (\w+)/
      );
      if (varMatch) {
        const firstName = varMatch[1];
        suggestions.push(`radius read-var ${file} --var ${firstName} --tag ${tag}`);
      }

      return suggestions;
    },
  },

  // Rule 4: view → outline, problems
  {
    match: (cmd) => cmd === "view",
    suggest: (file, tag) => [
      `radius outline ${file} --tag ${tag}`,
      `radius problems ${file} --tag ${tag}`,
    ],
  },

  // Rule 5: create-all → view, problems
  {
    match: (cmd) => cmd === "create-all",
    suggest: (file, tag) => [
      `radius view ${file} --tag ${tag}`,
      `radius problems ${file} --tag ${tag}`,
    ],
  },

  // Rule 6: problems with 0 errors (clean) → outline
  {
    match: (cmd, out) =>
      cmd === "problems" &&
      (out.includes("0 errors") || out.includes("(clean)")),
    suggest: (file, tag) => [`radius outline ${file} --tag ${tag}`],
  },

  // Rule 7: problems with N errors → fix
  {
    match: (cmd, out) =>
      cmd === "problems" &&
      !out.includes("0 errors") &&
      (out.includes("❌") || /\d+ error/.test(out)),
    suggest: (file, tag) => [`radius fix ${file} --tag ${tag}`],
  },

  // Rule 8: hover → read-var (if symbol name detected)
  {
    match: (cmd) => cmd === "hover",
    suggest: (file, tag, out) => {
      // Try to extract symbol name from hover output
      const symbolMatch = out.match(/symbol: (\w+)/);
      if (symbolMatch) {
        return [`radius read-var ${file} --var ${symbolMatch[1]} --tag ${tag}`];
      }
      return [];
    },
  },
];
