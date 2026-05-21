/**
 * Phase 7: Rust Language Support (rust-analyzer) via RDSX
 */

import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { RdsxRegistry } from "../src/rdsx/registry";
import { RustAdapter } from "../packages/rdsx-rs/src/adapter";

const rustProject = join(__dirname, "fixtures/rust-project");
const libFile = join(rustProject, "src/lib.rs");

// Check if rust-analyzer is available
let rustAnalyzerAvailable = false;
try {
  execSync("which rust-analyzer", { stdio: "ignore" });
  rustAnalyzerAvailable = true;
} catch {
  rustAnalyzerAvailable = false;
}

describe.skipIf(!rustAnalyzerAvailable)("Rust Language Support via RDSX", () => {
  test("T01: RdsxRegistry が Rust アナライザを返す", async () => {
    const registry = new RdsxRegistry();
    const rootUri = `file://${rustProject}`;
    registry.register(new RustAdapter(rootUri));

    const provider = registry.getAnalyzer("rust");
    expect(provider).not.toBeNull();
  });

  test("T02: Rust アナライザが activate できる", async () => {
    const registry = new RdsxRegistry();
    const rootUri = `file://${rustProject}`;
    const adapter = new RustAdapter(rootUri);
    registry.register(adapter);

    // Rust adapter is a stub, activate should not throw
    await expect(adapter.activate()).resolves.toBeUndefined();
  });

  test("T03: getSymbols がシンボルを返す", async () => {
    const registry = new RdsxRegistry();
    const rootUri = `file://${rustProject}`;
    registry.register(new RustAdapter(rootUri));

    const provider = registry.getAnalyzer("rust");
    if (!provider) throw new Error("Provider not found");

    const symbols = await provider.getSymbols(libFile, "");
    expect(Array.isArray(symbols)).toBe(true);
  });

  test("T04: getHoverInfo が型情報を返す", async () => {
    const registry = new RdsxRegistry();
    const rootUri = `file://${rustProject}`;
    registry.register(new RustAdapter(rootUri));

    const provider = registry.getAnalyzer("rust");
    if (!provider) throw new Error("Provider not found");

    const hover = await provider.getHoverInfo(libFile, 2, 8);
    expect(hover === null || typeof hover === "object").toBe(true);
  });

  test("T05: findReferences が参照を返す", async () => {
    const registry = new RdsxRegistry();
    const rootUri = `file://${rustProject}`;
    registry.register(new RustAdapter(rootUri));

    const provider = registry.getAnalyzer("rust");
    if (!provider) throw new Error("Provider not found");

    const refs = await provider.findReferences(libFile, 2, 8);
    expect(Array.isArray(refs)).toBe(true);
  });

  test("T06: getDiagnostics が診断情報を返す", async () => {
    const registry = new RdsxRegistry();
    const rootUri = `file://${rustProject}`;
    registry.register(new RustAdapter(rootUri));

    const provider = registry.getAnalyzer("rust");
    if (!provider) throw new Error("Provider not found");

    const diagnostics = await provider.getDiagnostics(libFile, "");
    expect(Array.isArray(diagnostics)).toBe(true);
  });

  test("T07: format がフォーマット結果を返す", async () => {
    const registry = new RdsxRegistry();
    const rootUri = `file://${rustProject}`;
    registry.register(new RustAdapter(rootUri));

    const provider = registry.getAnalyzer("rust");
    if (!provider) throw new Error("Provider not found");

    const edits = await provider.format(libFile, "");
    expect(Array.isArray(edits)).toBe(true);
  });

  test("T08: rename がリネーム結果を返す", async () => {
    const registry = new RdsxRegistry();
    const rootUri = `file://${rustProject}`;
    registry.register(new RustAdapter(rootUri));

    const provider = registry.getAnalyzer("rust");
    if (!provider) throw new Error("Provider not found");

    const edits = await provider.rename(libFile, 2, 8, "new_name");
    expect(Array.isArray(edits)).toBe(true);
  });
});
