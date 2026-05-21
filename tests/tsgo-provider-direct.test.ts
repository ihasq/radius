/**
 * TsgoProvider 直接テスト
 */

import { test, expect, describe } from "bun:test";
import { TsgoProvider } from "../packages/radls-ts/src/tsgo-provider";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("TsgoProvider Direct Test", () => {
  test("T01: TsgoProvider.getSymbols works", async () => {
    const projectRoot = join(process.cwd(), "tests/fixtures/ts-project");
    const rootUri = `file://${projectRoot}`;

    console.log(`[TEST] Creating TsgoProvider with rootUri: ${rootUri}`);

    const provider = new TsgoProvider(rootUri);

    const filePath = join(projectRoot, "src/main.ts");
    const content = readFileSync(filePath, "utf-8");

    console.log(`[TEST] Calling getSymbols for ${filePath}`);
    console.log(`[TEST] Content length: ${content.length} bytes`);

    const symbols = await provider.getSymbols(filePath, content);

    console.log(`[TEST] Got ${symbols.length} symbols`);

    expect(symbols.length).toBeGreaterThan(0);

    await provider.dispose();
  }, 20000);
});
