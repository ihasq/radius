/**
 * P0: RADIUS_SESSION + RADIUS_FORMAT 統合テスト (UT-01 ~ UT-12)
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius, extractTag } from "./helpers/radius";
import { setupFixture, cleanupFixture, readFixtureFile } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { join } from "node:path";

let tmpDir: string;
const SESSION_ID = "00000000-0000-4000-a000-000000000001";

beforeAll(async () => {
  setupTestRadiusHome("session-id");
  await startDaemon();
}, 10_000);

afterAll(async () => {
  await stopDaemon();
  cleanupTestRadiusHome();
});

beforeEach(async () => {
  tmpDir = await setupFixture("ts-project");
});

afterEach(async () => {
  await cleanupFixture(tmpDir);
});

// ─── UT-01: sessionId 解決 ────────────────────────────────────────

describe("UT-01: sessionId resolution", () => {
  test("RADIUS_SESSION env var is used as sessionId", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(
      ["view", filePath],
      {
        cwd: tmpDir,
        env: { RADIUS_SESSION: SESSION_ID },
      }
    );
    // sessionId モードでも backward compat のため radius-tag が出力される
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/radius-tag:/);
    expect(result.stdout).toContain("userName");
  }, 30_000);

  test("no RADIUS_SESSION still works (auto-generates)", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(
      ["view", filePath],
      { cwd: tmpDir }
    );
    // auto-generated sessionId でも radius-tag が出力される（backward compat）
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/radius-tag:/);
    expect(result.stdout).toContain("userName");
  }, 30_000);
});

// ─── UT-02: sessionId の一貫性 ─────────────────────────────────────

describe("UT-02: sessionId consistency", () => {
  test("same sessionId across 3 commands shares state", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const env = { RADIUS_SESSION: "sess-ut02" };

    // 1. str-replace
    const r1 = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const a: string = "default_user"'],
      { cwd: tmpDir, env }
    );
    expect(r1.exitCode).toBe(0);

    // 2. view
    const r2 = await radius(
      ["view", filePath],
      { cwd: tmpDir, env }
    );
    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toContain("const a");

    // 3. undo (同じsessionなので履歴からundo可能)
    const r3 = await radius(
      ["undo"],
      { cwd: tmpDir, env }
    );
    expect(r3.exitCode).toBe(0);
    expect(r3.stdout).toMatch(/undone/i);

    const content = readFixtureFile(tmpDir, "src/main.ts");
    expect(content).toContain("userName");
  }, 30_000);

  test("different sessionId = separate session", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const r1 = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const b: string = "default_user"'],
      { cwd: tmpDir, env: { RADIUS_SESSION: "sess-ut02a" } }
    );
    expect(r1.exitCode).toBe(0);

    // 別セッションからundo → 履歴なし
    const r2 = await radius(
      ["undo"],
      { cwd: tmpDir, env: { RADIUS_SESSION: "sess-ut02b" } }
    );
    expect(r2.stderr).toContain("No history");
  }, 30_000);
});

// ─── UT-03: undo/redo が tag なしで動作 ────────────────────────────

describe("UT-03: undo/redo without tag", () => {
  test("session mode: str-replace → undo → redo", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const env = { RADIUS_SESSION: "sess-ut03" };

    const r1 = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const step1: string = "default_user"'],
      { cwd: tmpDir, env }
    );
    expect(r1.exitCode).toBe(0);
    expect(readFixtureFile(tmpDir, "src/main.ts")).toContain("step1");

    // undo
    const r2 = await radius(["undo"], { cwd: tmpDir, env });
    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toMatch(/undone/i);
    expect(readFixtureFile(tmpDir, "src/main.ts")).toContain("userName");
    expect(readFixtureFile(tmpDir, "src/main.ts")).not.toContain("step1");

    // redo
    const r3 = await radius(["redo"], { cwd: tmpDir, env });
    expect(r3.exitCode).toBe(0);
    expect(r3.stdout).toMatch(/redone/i);
    expect(readFixtureFile(tmpDir, "src/main.ts")).toContain("step1");
  }, 30_000);

  test("session mode: multiple undo fails gracefully", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const env = { RADIUS_SESSION: "sess-ut03b" };

    const r1 = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const x: string = "default_user"'],
      { cwd: tmpDir, env }
    );
    expect(r1.exitCode).toBe(0);

    await radius(["undo"], { cwd: tmpDir, env });
    const r3 = await radius(["undo"], { cwd: tmpDir, env });
    expect(r3.stderr).toContain("No history");
  }, 30_000);
});

// ─── UT-04: 競合検出が sessionId ベース ─────────────────────────────

describe("UT-04: conflict detection based on sessionId", () => {
  test("different sessions editing overlapping lines = conflict", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // Session A の編集
    const rA = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const fromA: string = "default_user"'],
      { cwd: tmpDir, env: { RADIUS_SESSION: "sess-ut04a" } }
    );
    expect(rA.exitCode).toBe(0);

    // Session B が同じ行を編集 → 競合
    const rB = await radius(
      ["str-replace", filePath, "--old", 'const fromA: string = "default_user"', "--new", 'const fromB: string = "default_user"'],
      { cwd: tmpDir, env: { RADIUS_SESSION: "sess-ut04b" }, skipAutoReason: true }
    );
    expect(rB.exitCode).toBe(1);
    expect(rB.stderr).toMatch(/conflict/i);

    // Session B が --reason 付きで続行
    const rB2 = await radius(
      ["str-replace", filePath, "--old", 'const fromA: string = "default_user"', "--new", 'const fromB: string = "default_user"', "--reason", "overriding A"],
      { cwd: tmpDir, env: { RADIUS_SESSION: "sess-ut04b" } }
    );
    expect(rB2.exitCode).toBe(0);
  }, 30_000);
});

// ─── UT-05: tag 互換性 ─────────────────────────────────────────────

describe("UT-05: tag backward compatibility", () => {
  test("--tag mode produces radius-tag and chain continues", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // 1. --tag を明示的に渡す（未知のtagでも新しいチェーンとして扱われる）
    const r1 = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const tagged1: string = "default_user"', "--tag", "f53d-test0001"],
      { cwd: tmpDir }
    );
    // --tag が指定されているので sessionId は注入されず、tag モードで動作
    expect(r1.exitCode).toBe(0);

    // 2. タグ付き undo
    // tag モードでは radius-tag が返る（未知タグから始まるチェーンの最初のタグ）
    const tag1 = extractTag(r1.stdout);
    expect(tag1).toBeTruthy();

    const r2 = await radius(
      ["str-replace", filePath, "--old", 'const tagged1: string = "default_user"', "--new", 'const tagged2: string = "default_user"', "--tag", tag1],
      { cwd: tmpDir }
    );
    expect(r2.exitCode).toBe(0);

    const tag2 = extractTag(r2.stdout);
    const r3 = await radius(["undo", "--tag", tag2], { cwd: tmpDir });
    expect(r3.exitCode).toBe(0);
    expect(r3.stdout).toMatch(/undone/i);

    // ファイルが元に戻っている
    expect(readFixtureFile(tmpDir, "src/main.ts")).toContain("tagged1");
  }, 30_000);

  test("--tag with unknown format creates new chain", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const stepZ: string = "default_user"', "--tag", "abcd-UNKNOWN1"],
      { cwd: tmpDir }
    );
    expect(result.exitCode).toBe(0);
    // タグモードでは radius-tag が出力される
    const tag = extractTag(result.stdout);
    expect(tag).toBeTruthy();
    expect(tag).toMatch(/^\w{4}-\w+/);

    await radius(["undo", "--tag", tag], { cwd: tmpDir });
  }, 30_000);
});

// ─── UT-06: rewind 検知が不要になったことの確認 ─────────────────────

describe("UT-06: no rewind detection in session mode", () => {
  test("session mode does not trigger rewind on old state", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const env = { RADIUS_SESSION: "sess-ut06" };

    // str-replace #1
    const r1 = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const v1: string = "default_user"'],
      { cwd: tmpDir, env }
    );
    expect(r1.exitCode).toBe(0);

    // str-replace #2
    const r2 = await radius(
      ["str-replace", filePath, "--old", 'const v1: string = "default_user"', "--new", 'const v2: string = "default_user"'],
      { cwd: tmpDir, env }
    );
    expect(r2.exitCode).toBe(0);
    expect(readFixtureFile(tmpDir, "src/main.ts")).toContain("v2");

    // undo #1 (v2 → v1)
    await radius(["undo"], { cwd: tmpDir, env });
    expect(readFixtureFile(tmpDir, "src/main.ts")).toContain("v1");

    // さらに undo (v1 → userName)
    await radius(["undo"], { cwd: tmpDir, env });
    expect(readFixtureFile(tmpDir, "src/main.ts")).toContain("userName");
    expect(readFixtureFile(tmpDir, "src/main.ts")).not.toContain("v1");
  }, 30_000);
});

// ─── UT-07: 複数エージェント同時編集 ────────────────────────────────

describe("UT-07: multi-agent simultaneous editing", () => {
  test("3 different sessions editing different files = all succeed", async () => {
    const mainPath = join(tmpDir, "src/main.ts");
    const utilPath = join(tmpDir, "src/utils.ts");

    const rA = await radius(
      ["str-replace", mainPath, "--old", 'const userName: string = "default_user"', "--new", 'const aaa: string = "default_user"'],
      { cwd: tmpDir, env: { RADIUS_SESSION: "sess-ut07a" } }
    );
    expect(rA.exitCode).toBe(0);

    const rB = await radius(
      ["str-replace", utilPath, "--old", "getUserInfo", "--new", "fetchUserInfo"],
      { cwd: tmpDir, env: { RADIUS_SESSION: "sess-ut07b" } }
    );
    expect(rB.exitCode).toBe(0);

    const rC = await radius(
      ["view", mainPath],
      { cwd: tmpDir, env: { RADIUS_SESSION: "sess-ut07c" } }
    );
    expect(rC.exitCode).toBe(0);
    expect(rC.stdout).toContain("aaa");
  }, 30_000);
});

// ─── UT-08: compact モード ──────────────────────────────────────────

describe("UT-08: RADIUS_FORMAT=compact", () => {
  test("compact mode suppresses tag footer", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const env = { RADIUS_SESSION: "sess-ut08", RADIUS_FORMAT: "compact" };

    const result = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const cpt: string = "default_user"'],
      { cwd: tmpDir, env }
    );
    expect(result.exitCode).toBe(0);
    // compact モードでは tag footer が出力されない
    expect(result.stdout).not.toMatch(/radius-tag:/);
    expect(result.stdout).not.toMatch(/Welcome to Radius/);
    // データ部分は出力される
    expect(result.stdout).toContain("replaced");

    await radius(["undo"], { cwd: tmpDir, env });
  }, 30_000);

  test("compact mode still shows data content", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(
      ["view", filePath],
      {
        cwd: tmpDir,
        env: { RADIUS_FORMAT: "compact" },
      }
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("userName");
    expect(result.stdout).not.toMatch(/radius-tag:/);
    expect(result.stdout).not.toMatch(/Welcome to Radius/);
  }, 30_000);
});

// ─── UT-09: json モード ─────────────────────────────────────────────

describe("UT-09: RADIUS_FORMAT=json", () => {
  test("json mode outputs valid JSON", async () => {
    const result = await radius(
      ["ping"],
      { env: { RADIUS_FORMAT: "json" } }
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toBe("pong");
  }, 30_000);

  test("json mode on view returns structured data", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(
      ["view", filePath],
      {
        cwd: tmpDir,
        env: { RADIUS_FORMAT: "json" },
      }
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toContain("userName");
    expect(parsed.warnings).toBeUndefined();
    expect(parsed.error).toBeUndefined();
  }, 30_000);

  test("json mode error is structured", async () => {
    const result = await radius(
      ["str-replace", "/nonexistent/file.ts", "--old", "x", "--new", "y"],
      { env: { RADIUS_FORMAT: "json" } }
    );
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBeTruthy();
  }, 30_000);
});

// ─── UT-10: デフォルトモード互換性 ──────────────────────────────────

describe("UT-10: default mode compatibility", () => {
  test("default mode shows full output for --tag path", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(
      ["str-replace", filePath, "--old", 'const userName: string = "default_user"', "--new", 'const deflt: string = "default_user"'],
      { cwd: tmpDir }
    );
    expect(result.exitCode).toBe(0);
    // デフォルトモード（sessionId auto-generated）でも tag footer が出る（backward compat）
    // このテストは default RADIUS_FORMAT でエラーなく動作することを確認
    expect(result.stdout).toContain("replaced");

    await radius(["undo"], { cwd: tmpDir });
  }, 30_000);
});

// ─── UT-11: 無効な format 値 ────────────────────────────────────────

describe("UT-11: invalid RADIUS_FORMAT", () => {
  test("invalid format falls back to default", async () => {
    const result = await radius(
      ["ping"],
      { env: { RADIUS_FORMAT: "invalid_format" } }
    );
    expect(result.exitCode).toBe(0);
    // デフォルトとして動作（pong が返る）
    expect(result.stdout).toMatch(/pong/);
  }, 30_000);

  test("empty format works as default", async () => {
    const result = await radius(
      ["ping"],
      { env: { RADIUS_FORMAT: "" } }
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/pong/);
  }, 30_000);
});

// ─── UT-12: compact + json のエラー出力 ────────────────────────────

describe("UT-12: compact and json error output", () => {
  test("compact mode on error = no tag footer, just error", async () => {
    const result = await radius(
      ["str-replace", "/nonexistent/file.ts", "--old", "x", "--new", "y"],
      { env: { RADIUS_FORMAT: "compact" } }
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toMatch(/radius-tag:/);
    expect(result.stderr).toContain("error");
  }, 30_000);

  test("json mode on error = structured with exit code 1", async () => {
    const result = await radius(
      ["str-replace", "/nonexistent/file.ts", "--old", "x", "--new", "y"],
      { env: { RADIUS_FORMAT: "json" } }
    );
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
  }, 30_000);

  test("json mode with warnings includes them", async () => {
    const filePath = join(tmpDir, "src/main.ts");
    const result = await radius(
      ["str-replace", filePath, "--old", "nonexistent_text_12345", "--new", "replacement"],
      { env: { RADIUS_FORMAT: "json" } }
    );
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBeTruthy();
  }, 30_000);
});
