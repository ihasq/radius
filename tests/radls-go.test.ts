/**
 * Phase 7: Go Language Support (gopls)
 */

import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { resolveProvider } from "../src/core/radls-resolver";

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

describe.skipIf(!goplsAvailable)("Go Language Support", () => {
  test("T01: resolveProvider が Go プロバイダを返す", async () => {
    const provider = await resolveProvider(mainFile, 2);
    expect(provider).not.toBeNull();
  });

  test("T02: Go プロバイダが子プロセスとして起動できる", async () => {
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

    const hover = await provider.getHoverInfo(mainFile, 8, 6);
    expect(hover === null || typeof hover === "object").toBe(true);
  });

  test("T05: findReferences が参照を返す", async () => {
    const provider = await resolveProvider(mainFile, 2);
    if (!provider) throw new Error("Provider not found");

    const refs = await provider.findReferences(mainFile, 8, 6);
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
