/**
 * Phase 18: diff コマンドハンドラ。
 *
 * Gitを使用してファイルの変更差分を表示する。
 */

import { existsSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { findProjectRoot } from "../../shared/project";
import type { IpcResponse } from "../../shared/types";
import { added, removed } from "../../shared/colors";
import { errorResponse } from "../../shared/output";

/**
 * diff コマンドハンドラ。
 */
export async function handleDiff(
  args: Record<string, unknown>
): Promise<IpcResponse> {
  const file = args.file as string | undefined;
  const ref = args.ref as string | undefined;

  if (!file) {
    return errorResponse("Missing required arg: file");
  }

  const absPath = resolve(file);

  if (!existsSync(absPath)) {
    return errorResponse(`File not found: ${absPath}`);
  }

  const projectRoot = findProjectRoot(absPath);
  const relativePath = relative(projectRoot, absPath);

  // Git リポジトリかどうかを確認
  const gitCheck = spawnSync("git", ["rev-parse", "--git-dir"], {
    cwd: dirname(absPath),
    encoding: "utf-8",
  });

  if (gitCheck.status !== 0) {
    return { ok: true, data: "not a git repository" };
  }

  // git diff を実行
  const diffArgs = ["diff", "--no-color"];
  if (ref) {
    diffArgs.push(ref);
  }
  diffArgs.push("--", absPath);

  const result = spawnSync("git", diffArgs, {
    cwd: projectRoot,
    encoding: "utf-8",
  });

  if (result.status !== 0 && result.stderr) {
    return errorResponse(`git error: ${result.stderr}`);
  }

  const diffOutput = result.stdout.trim();

  if (!diffOutput) {
    return { ok: true, data: "no changes" };
  }

  // 差分を解析して整形
  const formatted = formatDiff(diffOutput, relativePath, ref);

  return { ok: true, data: formatted };
}

/**
 * git diff の出力を整形する。
 */
function formatDiff(
  diffOutput: string,
  relativePath: string,
  ref?: string
): string {
  const lines = diffOutput.split("\n");
  const output: string[] = [];
  let additions = 0;
  let deletions = 0;
  let changes = 0;
  let currentHunk = false;

  const refLabel = ref || "unstaged";
  output.push(`diff: ${relativePath} (${refLabel})`, "");

  for (const line of lines) {
    // ヘッダー行をスキップ
    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ")
    ) {
      continue;
    }

    // hunk ヘッダー (@@ ... @@)
    if (line.startsWith("@@")) {
      currentHunk = true;
      changes++;
      continue;
    }

    if (!currentHunk) continue;

    // 追加行
    if (line.startsWith("+")) {
      const text = line.substring(1);
      output.push(added(`+ ${text}`));
      additions++;
      continue;
    }

    // 削除行
    if (line.startsWith("-")) {
      const text = line.substring(1);
      output.push(removed(`- ${text}`));
      deletions++;
      continue;
    }

    // コンテキスト行
    if (line.startsWith(" ") || line === "") {
      output.push(`  ${line.substring(1)}`);
    }
  }

  output.push("");
  output.push(`${changes} change(s), ${additions} addition(s), ${deletions} deletion(s)`);

  return output.join("\n");
}
