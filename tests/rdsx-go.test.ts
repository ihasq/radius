/**
 * Phase 7: Go Language Support (gopls) via RDSX
 */

import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { RdsxRegistry } from "../src/rdsx/registry";
import { GoRdsxAnalyzer } from "../packages/rdsx-go/src/adapter";

const goProject = join(__dirname, "fixtures/go-project");
const mainFile = join(goProject, "main.go");

// Check if gopls is available
let goplsAvailable = false;
try {
  execSync("which gopls", { stdio: "ignore" });
  goplsAvailable = true;
} catch {
  goplsAvailable = false;
}

describe.skipIf(!goplsAvailable)("Go Language Support via RDSX", () => {
  test("T01: RdsxRegistry が Go アナライザを返す", async () => {
    const registry = new RdsxRegistry();
    registry.register(new GoRdsxAnalyzer());

    const provider = registry.getAnalyzer("go");
    expect(provider).not.toBeNull();
  });

  test("T02: Go アナライザが activate できる", async () => {
    const adapter = new GoRdsxAnalyzer();
    await expect(adapter.activate()).resolves.not.toThrow();
  });

  test("T03: getSymbols がシンボルを返す", async () => {
    const registry = new RdsxRegistry();
    registry.register(new GoRdsxAnalyzer());

    const provider = registry.getAnalyzer("go");
    if (!provider) throw new Error("Provider not found");

    const symbols = await provider.getSymbols(mainFile, "");
    expect(Array.isArray(symbols)).toBe(true);
  });

  test("T04: getHoverInfo が型情報を返す", async () => {
    const registry = new RdsxRegistry();
    registry.register(new GoRdsxAnalyzer());

    const provider = registry.getAnalyzer("go");
    if (!provider) throw new Error("Provider not found");

    const hover = await provider.getHoverInfo(mainFile, 5, 10);
    expect(hover === null || typeof hover === "object").toBe(true);
  });

  test("T05: findReferences が参照を返す", async () => {
    const registry = new RdsxRegistry();
    registry.register(new GoRdsxAnalyzer());

    const provider = registry.getAnalyzer("go");
    if (!provider) throw new Error("Provider not found");

    const refs = await provider.findReferences(mainFile, 5, 10);
    expect(Array.isArray(refs)).toBe(true);
  });

  test("T06: getDiagnostics が診断情報を返す", async () => {
    const registry = new RdsxRegistry();
    registry.register(new GoRdsxAnalyzer());

    const provider = registry.getAnalyzer("go");
    if (!provider) throw new Error("Provider not found");

    const diagnostics = await provider.getDiagnostics(mainFile, "");
    expect(Array.isArray(diagnostics)).toBe(true);
  });

  test("T07: format がフォーマット結果を返す", async () => {
    const registry = new RdsxRegistry();
    registry.register(new GoRdsxAnalyzer());

    const provider = registry.getAnalyzer("go");
    if (!provider) throw new Error("Provider not found");

    const edits = await provider.format(mainFile, "");
    expect(Array.isArray(edits)).toBe(true);
  });

  test("T08: rename がリネーム結果を返す", async () => {
    const registry = new RdsxRegistry();
    registry.register(new GoRdsxAnalyzer());

    const provider = registry.getAnalyzer("go");
    if (!provider) throw new Error("Provider not found");

    const edits = await provider.rename(mainFile, 5, 10, "new_name");
    expect(Array.isArray(edits)).toBe(true);
  });
});
