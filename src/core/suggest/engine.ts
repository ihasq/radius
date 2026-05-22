/**
 * Suggestion Engine
 *
 * Evaluates rules and generates command suggestions
 */

import { SUGGEST_RULES } from "./rules";

/**
 * Get command suggestions based on current context
 *
 * @param command - The command that was executed
 * @param output - The output from the command
 * @param filePath - The primary file being operated on
 * @param tag - The current tag
 * @returns Array of suggested command strings (max 3)
 */
export function getSuggestions(
  command: string,
  output: string,
  filePath: string,
  tag: string
): string[] {
  const suggestions: string[] = [];

  for (const rule of SUGGEST_RULES) {
    if (rule.match(command, output)) {
      const ruleSuggestions = rule.suggest(filePath, tag, output);
      suggestions.push(...ruleSuggestions);
    }
  }

  // Remove duplicates and limit to 3
  return [...new Set(suggestions)].slice(0, 3);
}
