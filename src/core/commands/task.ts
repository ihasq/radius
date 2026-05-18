/**
 * Phase 19: task コマンドハンドラ。
 *
 * .vscode/tasks.json のタスクを一覧表示・実行する。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { findProjectRoot } from "../../shared/project";
import type { IpcResponse } from "../../shared/types";
import { errorResponse } from "../../shared/output";

/** VS Code タスク定義。 */
interface VSCodeTask {
  label: string;
  type?: string;
  command?: string;
  args?: string[];
  group?: string | { kind: string; isDefault?: boolean };
  problemMatcher?: unknown;
  presentation?: unknown;
}

/** tasks.json 形式。 */
interface TasksJson {
  version: string;
  tasks: VSCodeTask[];
}

/**
 * task コマンドハンドラ。
 */
export async function handleTask(
  args: Record<string, unknown>,
  cwd: string
): Promise<IpcResponse> {
  const subcommand = args.subcommand as string | undefined;
  const name = args.name as string | undefined;

  // サブコマンドの検証
  if (!subcommand) {
    return errorResponse("Missing subcommand: list or run");
  }

  if (subcommand !== "list" && subcommand !== "run") {
    return errorResponse(`Unknown subcommand: ${subcommand}`);
  }

  const projectRoot = findProjectRoot(cwd);
  const tasksJsonPath = join(projectRoot, ".vscode", "tasks.json");

  // tasks.json の存在チェック
  if (!existsSync(tasksJsonPath)) {
    if (subcommand === "list") {
      return { ok: true, data: "no tasks defined (no .vscode/tasks.json found)" };
    }
    return errorResponse("no tasks.json found in .vscode directory");
  }

  // tasks.json を読み込み
  let tasksConfig: TasksJson;
  try {
    const content = readFileSync(tasksJsonPath, "utf-8");
    tasksConfig = JSON.parse(content);
  } catch (err) {
    return errorResponse(`Failed to parse tasks.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  const tasks = tasksConfig.tasks || [];

  if (subcommand === "list") {
    return handleTaskList(tasks);
  }

  if (subcommand === "run") {
    if (!name) {
      return errorResponse("Missing task name for 'run' subcommand");
    }
    return handleTaskRun(tasks, name, projectRoot);
  }

  return errorResponse(`Unknown subcommand: ${subcommand}`);
}

/**
 * タスク一覧を表示する。
 */
function handleTaskList(tasks: VSCodeTask[]): IpcResponse {
  if (tasks.length === 0) {
    return { ok: true, data: "no tasks defined in tasks.json" };
  }

  const output: string[] = ["tasks:"];

  for (const task of tasks) {
    const groupInfo = getGroupInfo(task.group);
    const typeInfo = task.type ? ` (${task.type})` : "";
    output.push(`  ${task.label}${typeInfo}${groupInfo}`);
  }

  return { ok: true, data: output.join("\n") };
}

/**
 * タスクを実行する。
 */
function handleTaskRun(tasks: VSCodeTask[], name: string, projectRoot: string): IpcResponse {
  const task = tasks.find((t) => t.label === name);

  if (!task) {
    return errorResponse(`task not found: ${name}`);
  }

  // コマンドを構築
  let command: string;

  if (task.type === "shell" || !task.type) {
    // シェルタスク
    command = task.command || "";
    if (task.args && task.args.length > 0) {
      command += " " + task.args.join(" ");
    }
  } else if (task.type === "npm") {
    // npm タスク
    command = `npm run ${task.command || ""}`;
  } else if (task.type === "process") {
    // プロセスタスク
    command = task.command || "";
    if (task.args && task.args.length > 0) {
      command += " " + task.args.join(" ");
    }
  } else {
    return errorResponse(`Unsupported task type: ${task.type}`);
  }

  if (!command.trim()) {
    return errorResponse(`Task '${name}' has no command defined`);
  }

  // タスクを実行
  try {
    const result = execSync(command, {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
    });

    const output: string[] = [
      `task executed: ${name}`,
      `command: ${command}`,
      "",
      "output:",
      result.trim() || "(no output)",
    ];

    return { ok: true, data: output.join("\n") };
  } catch (err: unknown) {
    const execError = err as { stdout?: string; stderr?: string; message?: string };
    const stdout = execError.stdout || "";
    const stderr = execError.stderr || "";
    const output = stdout + stderr;

    return errorResponse(`Task '${name}' failed: ${output || execError.message}`);
  }
}

/**
 * タスクグループ情報を取得する。
 */
function getGroupInfo(group: string | { kind: string; isDefault?: boolean } | undefined): string {
  if (!group) return "";

  if (typeof group === "string") {
    return ` [${group}]`;
  }

  if (group.isDefault) {
    return ` [${group.kind}, default]`;
  }

  return ` [${group.kind}]`;
}
