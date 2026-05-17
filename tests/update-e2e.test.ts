/**
 * Auto-update: radiusd shell script E2E tests.
 *
 * Tests the full auto-update workflow using a mock CDN server.
 */

import { describe, test, expect, beforeAll, afterEach, beforeEach } from "bun:test";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, symlinkSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawn } from "node:child_process";
import { tmpdir } from "node:os";

import { startMockCdn, createSignedBinary, type MockCdnServer } from "./helpers/mock-cdn";

const FIXTURE_DIR = join(import.meta.dir, "fixtures/update");
const PROJECT_ROOT = join(import.meta.dir, "..");

// Ensure fixtures exist before tests
beforeAll(() => {
  const pubPath = join(FIXTURE_DIR, "pub.json");
  if (!existsSync(pubPath)) {
    execSync("bun run generate-fixtures.ts", { cwd: FIXTURE_DIR });
  }
});

function loadFixture(name: string): Buffer {
  return readFileSync(join(FIXTURE_DIR, name));
}

function loadTextFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf-8");
}

function loadJsonFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf-8"));
}

// Temporary directory management
let tempDirs: string[] = [];
let mockServer: MockCdnServer | null = null;

function createTempDir(): string {
  const dir = join(tmpdir(), `radius-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  // Stop mock server if running
  if (mockServer) {
    mockServer.stop();
    mockServer = null;
  }

  // Clean up temp directories
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
  tempDirs = [];
});

function getPlatformKey(): string {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "linux") {
    return arch === "arm64" ? "linux-arm64" : "linux-x64";
  }
  if (platform === "darwin") {
    return arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  }
  if (platform === "win32") {
    return "win-x64";
  }
  return "linux-x64";
}

async function runRadiusd(
  args: string[],
  env: Record<string, string>,
  timeout = 30000
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const radiusdPath = join(PROJECT_ROOT, "radiusd");
    const proc = spawn(radiusdPath, args, {
      env: { ...process.env, ...env },
      timeout,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    proc.on("error", (err) => {
      stderr += err.message;
      resolve({ exitCode: 1, stdout, stderr });
    });
  });
}

async function setupMockServer(): Promise<MockCdnServer> {
  const platformKey = getPlatformKey();
  const latestJson = loadTextFixture("latest.json");
  const pubJson = loadTextFixture("pub.json");
  const gzData = loadFixture("fake-core.gz");
  const sigData = loadFixture("fake-core.gz.sig");

  mockServer = await startMockCdn({
    latestJson,
    pubJson,
    binaries: {
      [platformKey]: { gz: gzData, sig: sigData },
    },
  });

  return mockServer;
}

describe("radiusd auto-update E2E", () => {
  test("initial run downloads and installs binary", async () => {
    const server = await setupMockServer();
    const radiusHome = createTempDir();

    const { exitCode, stdout, stderr } = await runRadiusd(
      ["--exec", "ping"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: server.url,
      },
      60000
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("pong");

    // Verify binary was installed
    const currentPath = join(radiusHome, "bin", "current", "core");
    expect(existsSync(currentPath)).toBe(true);

    // Verify hash directory exists
    const latestJson = loadJsonFixture("latest.json") as { hash: string };
    const hashDir = join(radiusHome, "bin", latestJson.hash);
    expect(existsSync(join(hashDir, "core"))).toBe(true);
  }, 60_000);

  test("subsequent run uses cached binary without download", async () => {
    const server = await setupMockServer();
    const radiusHome = createTempDir();

    // First run - install binary
    await runRadiusd(
      ["--exec", "ping"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: server.url,
      },
      60000
    );

    // Clear request log
    server.clearLog();

    // Second run - should use cached
    const { exitCode, stdout } = await runRadiusd(
      ["--exec", "ping"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: server.url,
      },
      30000
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("pong");

    // Should not have requested latest.json (within 12-hour window)
    const requests = server.getRequestLog();
    const latestRequests = requests.filter((r) => r.includes("latest.json"));
    expect(latestRequests.length).toBe(0);
  }, 30_000);

  test("update check triggers after 12 hours", async () => {
    const server = await setupMockServer();
    const radiusHome = createTempDir();

    // First run - install binary
    await runRadiusd(
      ["--exec", "ping"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: server.url,
      },
      60000
    );

    // Set last-update-check mtime to 13 hours ago
    const checkFile = join(radiusHome, "last-update-check");
    writeFileSync(checkFile, "");
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000);
    utimesSync(checkFile, thirteenHoursAgo, thirteenHoursAgo);

    // Update latest.json to new version
    const newVersion = {
      version: "0.99.1",
      hash: "newversion123",
      timestamp: new Date().toISOString(),
      assets: loadJsonFixture("latest.json").assets,
    };

    // Create new binary with new hash
    const privKey = loadJsonFixture("priv.json") as JsonWebKey;
    const newBinary = await createSignedBinary(
      Buffer.from("#!/bin/sh\necho pong-v2\n"),
      privKey
    );

    // Restart server with new version
    server.stop();
    const platformKey = getPlatformKey();
    mockServer = await startMockCdn({
      latestJson: JSON.stringify({
        ...newVersion,
        assets: {
          [platformKey]: {
            url: `${platformKey}.gz`,
            sha256: newBinary.sha256,
          },
        },
      }),
      pubJson: loadTextFixture("pub.json"),
      binaries: {
        [platformKey]: { gz: newBinary.gz, sig: newBinary.sig },
      },
    });

    // Run radiusd - should trigger background update
    const { exitCode, stdout } = await runRadiusd(
      ["--exec", "ping"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: mockServer.url,
      },
      60000
    );

    // Should return immediately with old version
    expect(exitCode).toBe(0);
    expect(stdout).toContain("pong");

    // Wait for background update (max 10 seconds)
    let newVersionInstalled = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (existsSync(join(radiusHome, "bin", "newversion123", "core"))) {
        newVersionInstalled = true;
        break;
      }
    }

    expect(newVersionInstalled).toBe(true);
  }, 60_000);

  test("tampered binary is rejected", async () => {
    const radiusHome = createTempDir();
    const platformKey = getPlatformKey();

    // Use tampered binary with valid signature (signature mismatch)
    const tamperedGz = loadFixture("fake-core-tampered.gz");
    const validSig = loadFixture("fake-core.gz.sig"); // Signature for non-tampered

    mockServer = await startMockCdn({
      latestJson: loadTextFixture("latest.json"),
      pubJson: loadTextFixture("pub.json"),
      binaries: {
        [platformKey]: { gz: tamperedGz, sig: validSig },
      },
    });

    const { exitCode, stderr } = await runRadiusd(
      ["--exec", "ping"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: mockServer.url,
      },
      30000
    );

    expect(exitCode).not.toBe(0);
    // SHA256 check happens before signature verification, so either error is acceptable
    expect(stderr.toLowerCase()).toMatch(/signature.*verif|verif.*fail|sha256.*mismatch|integrity.*fail/i);

    // Binary should not be installed
    const currentPath = join(radiusHome, "bin", "current");
    expect(existsSync(currentPath)).toBe(false);
  }, 30_000);

  test("network failure falls back to existing binary", async () => {
    const server = await setupMockServer();
    const radiusHome = createTempDir();

    // First run - install binary
    await runRadiusd(
      ["--exec", "ping"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: server.url,
      },
      60000
    );

    // Set last-update-check to 13 hours ago
    const checkFile = join(radiusHome, "last-update-check");
    writeFileSync(checkFile, "");
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000);
    utimesSync(checkFile, thirteenHoursAgo, thirteenHoursAgo);

    // Stop server to simulate network failure
    server.stop();
    mockServer = null;

    // Run radiusd - should use existing binary
    const { exitCode, stdout } = await runRadiusd(
      ["--exec", "ping"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: "http://localhost:99999", // Unreachable
      },
      30000
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("pong");
  }, 30_000);

  test("first run with network failure shows error", async () => {
    const radiusHome = createTempDir();

    const { exitCode, stderr } = await runRadiusd(
      ["--exec", "ping"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: "http://localhost:99999", // Unreachable
      },
      30000
    );

    expect(exitCode).not.toBe(0);
    expect(stderr.toLowerCase()).toMatch(/download.*fail|connection.*refuse|network|fetch/i);
  }, 30_000);

  test("old versions are preserved in bin directory", async () => {
    const server = await setupMockServer();
    const radiusHome = createTempDir();
    const platformKey = getPlatformKey();

    // First run - install version 1
    await runRadiusd(
      ["--exec", "ping"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: server.url,
      },
      60000
    );

    const v1Hash = (loadJsonFixture("latest.json") as { hash: string }).hash;

    // Create version 2
    const privKey = loadJsonFixture("priv.json") as JsonWebKey;
    const v2Binary = await createSignedBinary(
      Buffer.from("#!/bin/sh\necho pong-v2\n"),
      privKey
    );
    const v2Hash = "version2hash1";

    server.stop();
    mockServer = await startMockCdn({
      latestJson: JSON.stringify({
        version: "0.99.2",
        hash: v2Hash,
        timestamp: new Date().toISOString(),
        assets: {
          [platformKey]: {
            url: `${platformKey}.gz`,
            sha256: v2Binary.sha256,
          },
        },
      }),
      pubJson: loadTextFixture("pub.json"),
      binaries: {
        [platformKey]: { gz: v2Binary.gz, sig: v2Binary.sig },
      },
    });

    // Force update check
    const checkFile = join(radiusHome, "last-update-check");
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000);
    utimesSync(checkFile, thirteenHoursAgo, thirteenHoursAgo);

    // Run radiusd to trigger update
    await runRadiusd(
      ["--exec", "ping"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: mockServer.url,
      },
      60000
    );

    // Wait for update
    await new Promise((r) => setTimeout(r, 5000));

    // Both versions should exist
    expect(existsSync(join(radiusHome, "bin", v1Hash, "core"))).toBe(true);
    expect(existsSync(join(radiusHome, "bin", v2Hash, "core"))).toBe(true);
  }, 60_000);

  test("radius upgrade forces immediate update", async () => {
    const server = await setupMockServer();
    const radiusHome = createTempDir();
    const platformKey = getPlatformKey();

    // First run - install version 1
    await runRadiusd(
      ["--exec", "ping"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: server.url,
      },
      60000
    );

    // Create version 2
    const privKey = loadJsonFixture("priv.json") as JsonWebKey;
    const v2Binary = await createSignedBinary(
      Buffer.from("#!/bin/sh\necho pong-v2\n"),
      privKey
    );
    const v2Hash = "upgrade-hash-2";

    server.stop();
    mockServer = await startMockCdn({
      latestJson: JSON.stringify({
        version: "0.99.2",
        hash: v2Hash,
        timestamp: new Date().toISOString(),
        assets: {
          [platformKey]: {
            url: `${platformKey}.gz`,
            sha256: v2Binary.sha256,
          },
        },
      }),
      pubJson: loadTextFixture("pub.json"),
      binaries: {
        [platformKey]: { gz: v2Binary.gz, sig: v2Binary.sig },
      },
    });

    // Run radius upgrade
    const { exitCode, stdout } = await runRadiusd(
      ["upgrade"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: mockServer.url,
      },
      60000
    );

    expect(exitCode).toBe(0);
    expect(stdout.toLowerCase()).toContain("updated to");

    // Verify current points to new version
    expect(existsSync(join(radiusHome, "bin", v2Hash, "core"))).toBe(true);
  }, 60_000);

  test("radius upgrade when already latest shows message", async () => {
    const server = await setupMockServer();
    const radiusHome = createTempDir();

    // First run - install binary
    await runRadiusd(
      ["--exec", "ping"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: server.url,
      },
      60000
    );

    // Run upgrade - should say already up to date
    const { exitCode, stdout } = await runRadiusd(
      ["upgrade"],
      {
        RADIUS_HOME: radiusHome,
        RADIUS_CDN_URL: server.url,
      },
      30000
    );

    expect(exitCode).toBe(0);
    expect(stdout.toLowerCase()).toMatch(/already.*up.*to.*date|latest|current/i);
  }, 30_000);
});
