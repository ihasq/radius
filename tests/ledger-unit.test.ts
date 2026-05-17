/**
 * ChangeLedger Unit Test
 */

import { test, expect, describe, beforeEach } from "bun:test";
import { ChangeLedger } from "../src/core/agent/ledger";
import { rmSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// テスト前に全ledgerファイルをクリーンアップ
beforeEach(() => {
  try {
    const radiusDir = join(homedir(), ".radius");
    if (!existsSync(radiusDir)) return;

    for (const entry of readdirSync(radiusDir)) {
      const ledgerPath = join(radiusDir, entry, "ledger.json");
      if (existsSync(ledgerPath)) {
        try {
          unlinkSync(ledgerPath);
        } catch {}
      }
    }
  } catch {}
});

describe("ChangeLedger", () => {
  test("records and retrieves entries", async () => {
    const ledger = new ChangeLedger("/tmp/test-ledger-project");

    // Record entry
    const entry = await ledger.record({
      chainId: "chain-a",
      filePath: "/tmp/test.ts",
      timestamp: new Date().toISOString(),
      command: "replace",
      startLine: 1,
      endLine: 3,
      newEndLine: 3,
      changesetId: "cs-123",
    });

    expect(entry.id).toBeTruthy();
    expect(entry.chainId).toBe("chain-a");

    // Retrieve entry
    const retrieved = await ledger.getEntry(entry.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved!.chainId).toBe("chain-a");

    // Get recent changes
    const recent = await ledger.getRecentChanges("/tmp/test.ts", 30);
    expect(recent.length).toBe(1);
    expect(recent[0].chainId).toBe("chain-a");

    console.log("✓ Ledger basic operations work");
  });

  test("finds overlapping changes", async () => {
    const ledger = new ChangeLedger("/tmp/test-ledger-project-2");

    // Chain A makes a change
    await ledger.record({
      chainId: "chain-a",
      filePath: "/tmp/test.ts",
      timestamp: new Date().toISOString(),
      command: "replace",
      startLine: 5,
      endLine: 10,
      newEndLine: 10,
      changesetId: "cs-1",
    });

    // Chain B makes an overlapping change
    const overlaps = await ledger.findOverlaps(
      "/tmp/test.ts",
      8,
      12,
      "chain-b",
      30
    );

    expect(overlaps.length).toBe(1);
    expect(overlaps[0].chainId).toBe("chain-a");

    console.log("✓ Overlap detection works");
  });
});
