/**
 * Tag / session footer output for CLI responses.
 */

import { muted } from "../shared/colors";

export interface TagFooterOptions {
  tag: string;
  isFirstTag?: boolean;
  tagHistory?: string[];
  /** Implicit session mode (RADIUS_SESSION or auto-resolved session). */
  sessionMode?: boolean;
  sessionId?: string;
}

/**
 * Print the post-command tag footer (suppressed in compact mode).
 */
export function printTagFooter(options: TagFooterOptions): void {
  if (process.env.RADIUS_FORMAT === "compact") return;

  const { tag, isFirstTag, tagHistory, sessionMode, sessionId } = options;

  console.log(muted("\n---"));

  if (sessionMode) {
    console.log(muted(`session: ${sessionId ?? "active"} — undo/redo shared; no --tag needed`));
    console.log(`radius-tag: ${tag}`);
    if (isFirstTag) {
      console.log("");
      console.log(muted("> Edits in this session share undo/redo history automatically."));
      console.log(muted("> For multi-agent work, set a distinct RADIUS_SESSION per agent."));
      console.log(muted("> Use RADIUS_FORMAT=compact to hide this footer."));
    }
    return;
  }

  const historyLength = tagHistory?.length ?? 0;

  console.log(`radius-tag: ${tag}`);
  console.log("");

  if (historyLength <= 1) {
    if (isFirstTag) {
      console.log(muted("> **Welcome to Radius.** Pass `--tag` to link edits into a chain."));
      console.log(muted("> Tip: set RADIUS_SESSION once to skip `--tag` on every command."));
      console.log("");
    }
    console.log(muted(`chain: ${tag}`));
    console.log("");
    console.log(muted("> Pass the latest `--tag` on your next command, or set RADIUS_SESSION."));
    console.log(muted("> Use `--reason \"...\"` when intentionally overriding another editor's changes."));
  } else if (historyLength <= 4) {
    const chain = tagHistory!.join(" → ");
    console.log(muted(`chain: ${chain}`));
    const lastTagStartPos = chain.lastIndexOf(tag);
    const spaces = " ".repeat("chain: ".length + lastTagStartPos);
    console.log(muted(`${spaces}${"^".repeat(tag.length)} use this`));
  } else {
    const recentTags = tagHistory!.slice(-3);
    const chain = "... → " + recentTags.join(" → ");
    console.log(muted(`chain: ${chain}`));
    const lastTag = recentTags[recentTags.length - 1];
    const lastTagStartPos = chain.lastIndexOf(lastTag);
    const spaces = " ".repeat("chain: ".length + lastTagStartPos);
    console.log(muted(`${spaces}${"^".repeat(lastTag.length)} use this`));
  }
}
