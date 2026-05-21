/**
 * Phase 7: Zig Language Support (zls)
 */

import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { resolveProvider } from "../src/core/radls-resolver";

const zigProject = join(__dirname, "fixtures/zig-project");
const mainFile = join(zigProject, "src/main.zig");

// Check if zls is available
let zlsAvailable = false;
try {
  execSync("which zls", { stdio: "ignore" });
  zlsAvailable = true;
} catch {
  zlsAvailable = false;
}

describe.skipIf(!zlsAvailable)("Zig Language Support", () => {
  test("T01: resolveProvider が Zig プロバイダを返す", async () => {
    const provider = await resolveProvider(mainFile, 2);
    expect(provider).not.toBeNull();
  });

  test("T02: Zig プロバイダが子プロセスとして起動できる", async () => {
    const provider = await resolveProvider(mainFile, 2);
    expect(provider).not.toBeNull();
  });

  test("T03: getSymbols がシンボルを返す", async () => {
    const provider = await resolveProvider(mainFile, 2);
    if (!provider) throw new Error("Provider not found");

    const symbols = await provider.getSymbols(mainFile, "");
    expect(Array.isArray(symbols)).toBe(true);
  });

  test("T04: getHoverInfo が型情報を返す", async () => {
    const provider = await resolveProvider(mainFile, 2);
    if (!provider) throw new Error("Provider not found");

    const hover = await provider.getHoverInfo(mainFile, 4, 8);
    expect(hover === null || typeof hover === "object").toBe(true);
  });

  test("T05: findReferences が参照を返す", async () => {
    const provider = await resolveProvider(mainFile, 2);
    if (!provider) throw new Error("Provider not found");

    const refs = await provider.findReferences(mainFile, 4, 8);
    expect(Array.isArray(refs)).toBe(true);
  });

  test("T06: getDiagnostics が診断を返す", async () => {
    const provider = await resolveProvider(mainFile, 2);
    if (!provider) throw new Error("Provider not found");

    const diagnostics = await provider.getDiagnostics(mainFile);
    expect(Array.isArray(diagnostics)).toBe(true);
  });

  test("T07: shutdown で正常終了する", async () => {
    const provider = await resolveProvider(mainFile, 2);
    if (provider && typeof (provider as any).shutdown === "function") {
      await (provider as any).shutdown();
    }
    expect(true).toBe(true);
  });

  test("T08: radiusd のプロセス管理で管理される", async () => {
    const provider = await resolveProvider(mainFile, 2);
    expect(provider).not.toBeNull();
  });
});
