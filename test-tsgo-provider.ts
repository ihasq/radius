/**
 * TsgoProvider の直接テスト（デバッグ用）
 */

import { TsgoProvider } from "./packages/radls-ts/src/tsgo-provider";
import { readFileSync } from "node:fs";

async function main() {
  console.log("=== TsgoProvider Direct Test ===");

  const projectRoot = process.cwd() + "/tests/fixtures/ts-project";
  const rootUri = `file://${projectRoot}`;

  console.log(`Project root: ${projectRoot}`);
  console.log(`Root URI: ${rootUri}`);

  const provider = new TsgoProvider(rootUri);

  console.log("Provider created, calling getSymbols...");

  const filePath = projectRoot + "/src/main.ts";
  const content = readFileSync(filePath, "utf-8");

  console.log(`File: ${filePath}`);
  console.log(`Content length: ${content.length} bytes`);

  try {
    const symbols = await provider.getSymbols(filePath, content);
    console.log(`Got ${symbols.length} symbols`);
    symbols.forEach(sym => {
      console.log(`  - ${sym.kind} ${sym.name} [line ${sym.line}]`);
    });
  } catch (err) {
    console.error("Error:", err);
  }

  console.log("Disposing provider...");
  await provider.dispose();
  console.log("Done.");
}

main().catch(console.error);
