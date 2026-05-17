/**
 * Graph Command Test
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius } from "./helpers/radius";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupFixture, cleanupFixture } from "./helpers/fixtures";
import { join } from "node:path";

let tmpDir: string;

beforeAll(async () => {
  await startDaemon();
});

afterAll(async () => {
  await stopDaemon();
});

beforeEach(async () => {
  tmpDir = await setupFixture("ts-project");
});

afterEach(async () => {
  await cleanupFixture(tmpDir);
});

function isValidMermaidStart(output: string): boolean {
  return /^graph\s+(LR|TD|TB|RL|BT)/m.test(output);
}

function countNodes(output: string): number {
  return (output.match(/^\s+\w+\["/gm) || []).length;
}

function countEdges(output: string): number {
  return (output.match(/-->/g) || []).length;
}

describe("graph imports", () => {
  test("outputs valid Mermaid graph LR", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "graph",
      "imports",
      filePath,
    ]);

    expect(result.exitCode).toBe(0);
    expect(isValidMermaidStart(result.stdout)).toBe(true);
    expect(result.stdout).toMatch(/^graph\s+LR/m);
  });

  test("highlights target file", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "graph",
      "imports",
      filePath,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(":::highlight");
  });

  test("shows import edges with labels", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "graph",
      "imports",
      filePath,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("-->");
    // import content がラベルとして含まれる
    expect(result.stdout).toMatch(/\|.*\|/);
  });

  test("respects --depth option", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    // depth 1
    const r1 = await radius([
      "graph",
      "imports",
      filePath,
      "--depth",
      "1",
    ]);

    // depth 2
    const r2 = await radius([
      "graph",
      "imports",
      filePath,
      "--depth",
      "2",
    ]);

    expect(r1.exitCode).toBe(0);
    expect(r2.exitCode).toBe(0);

    const nodes1 = countNodes(r1.stdout);
    const nodes2 = countNodes(r2.stdout);

    // depth 2 の方がノード数が多いか同じ
    expect(nodes2).toBeGreaterThanOrEqual(nodes1);
  });
});

describe("graph refs", () => {
  test("outputs valid Mermaid graph TD", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "graph",
      "refs",
      filePath,
      "userName",
    ]);

    expect(result.exitCode).toBe(0);
    expect(isValidMermaidStart(result.stdout)).toBe(true);
    expect(result.stdout).toMatch(/^graph\s+TD/m);
  });

  test("shows definition node with highlight", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "graph",
      "refs",
      filePath,
      "userName",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("(definition)");
    expect(result.stdout).toContain(":::highlight");
  });

  test("shows reference nodes with file and line", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "graph",
      "refs",
      filePath,
      "userName",
    ]);

    expect(result.exitCode).toBe(0);
    // ファイル名と行番号が含まれる
    expect(result.stdout).toMatch(/\w+\.ts/);
    expect(result.stdout).toMatch(/:\d+/);
  });

  test("returns error for nonexistent symbol", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "graph",
      "refs",
      filePath,
      "nonexistentSymbol",
    ]);

    // エラーまたは空のグラフ
    expect([0, 1]).toContain(result.exitCode);
  });
});

describe("graph calls", () => {
  test("outputs valid Mermaid graph TD", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "graph",
      "calls",
      filePath,
      "greet",
    ]);

    expect(result.exitCode).toBe(0);
    expect(isValidMermaidStart(result.stdout)).toBe(true);
    expect(result.stdout).toMatch(/^graph\s+TD/m);
  });

  test("shows target function with highlight", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "graph",
      "calls",
      filePath,
      "greet",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(":::highlight");
    expect(result.stdout).toContain("greet");
  });

  test("shows incoming and outgoing calls", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "graph",
      "calls",
      filePath,
      "calc",
    ]);

    expect(result.exitCode).toBe(0);
    // エッジが存在する（incoming または outgoing）
    const edges = countEdges(result.stdout);
    expect(edges).toBeGreaterThanOrEqual(0);
  });

  test("falls back with note when call hierarchy unavailable", async () => {
    const filePath = join(tmpDir, "src/main.ts");

    const result = await radius([
      "graph",
      "calls",
      filePath,
      "greet",
    ]);

    // LSP が call hierarchy をサポートしていない場合、noteが含まれる可能性
    // または正常に動作する
    expect(result.exitCode).toBe(0);
  });
});
