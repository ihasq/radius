/**
 * Test that commands return change metadata
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { startDaemon, stopDaemon } from "./helpers/daemon";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { sendRequest } from "../src/ipc/client";
import { writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("change-metadata");
  await startDaemon();
});

afterAll(async () => {
  await stopDaemon();
  cleanupTestRadiusHome();
});

beforeEach(() => {
  tmpDir = join(tmpdir(), `radius-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

describe("Change Metadata", () => {
  test("replace command returns changes field", async () => {
    const testFile = join(tmpDir, "test.ts");
    writeFileSync(testFile, 'const userName = "test";');

    const response = await sendRequest({
      command: "replace",
      args: {
        file: testFile,
        pattern: "userName",
        replacement: "userId",
        agent: "agent-test",
      },
      cwd: tmpDir,
    });

    console.log("Response:", JSON.stringify(response, null, 2));

    expect(response).toBeTruthy();
    expect(response!.ok).toBe(true);
    expect(response!.changes).toBeTruthy();
    expect(Array.isArray(response!.changes)).toBe(true);
    expect(response!.changes!.length).toBeGreaterThan(0);

    const change = response!.changes![0];
    expect(change.filePath).toBe(testFile);
    expect(change.startLine).toBeGreaterThan(0);
    expect(change.endLine).toBeGreaterThan(0);

    console.log("✓ Changes field is present and valid");
  });
});
