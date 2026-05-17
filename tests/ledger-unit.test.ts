/**
 * ChangeLedger Unit Test
 */

import { test, expect, describe } from "bun:test";
import { ChangeLedger } from "../src/core/agent/ledger";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

describe("ChangeLedger", () => {
  test("records and retrieves entries", async () => {
    const ledger = new ChangeLedger("/tmp/test-ledger-project");

    // Record entry
    const entry = await ledger.record({
      agentId: "agent-a",
      filePath: "/tmp/test.ts",
      timestamp: new Date().toISOString(),
      command: "replace",
      startLine: 1,
      endLine: 3,
      newEndLine: 3,
      changesetId: "cs-123",
    });

    expect(entry.id).toBeTruthy();
    expect(entry.agentId).toBe("agent-a");

    // Retrieve entry
    const retrieved = await ledger.getEntry(entry.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved!.agentId).toBe("agent-a");

    // Get recent changes
    const recent = await ledger.getRecentChanges("/tmp/test.ts", 30);
    expect(recent.length).toBe(1);
    expect(recent[0].agentId).toBe("agent-a");

    console.log("✓ Ledger basic operations work");
  });

  test("finds overlapping changes", async () => {
    const ledger = new ChangeLedger("/tmp/test-ledger-project-2");

    // Agent A makes a change
    await ledger.record({
      agentId: "agent-a",
      filePath: "/tmp/test.ts",
      timestamp: new Date().toISOString(),
      command: "replace",
      startLine: 5,
      endLine: 10,
      newEndLine: 10,
      changesetId: "cs-1",
    });

    // Agent B makes an overlapping change
    const overlaps = await ledger.findOverlaps(
      "/tmp/test.ts",
      8,
      12,
      "agent-b",
      30
    );

    expect(overlaps.length).toBe(1);
    expect(overlaps[0].agentId).toBe("agent-a");

    console.log("✓ Overlap detection works");
  });
});
