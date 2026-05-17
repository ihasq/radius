/**
 * Auto-update: Version management unit tests.
 *
 * Tests for src/shared/update.ts
 */

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

// Import target functions (will fail until implemented)
import {
  parseLatestJson,
  needsUpdate,
  getPlatformKey,
  extractAndVerify,
  updateCurrentLink,
} from "../src/shared/update";

const FIXTURE_DIR = join(import.meta.dir, "fixtures/update");

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

// Temporary directory management
let tempDirs: string[] = [];

function createTempDir(): string {
  const dir = join(tmpdir(), `radius-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
  tempDirs = [];
});

describe("latest.json parsing", () => {
  test("parseLatestJson returns valid ReleaseInfo", () => {
    const json = loadTextFixture("latest.json");
    const result = parseLatestJson(json);

    expect(result).not.toBeNull();
    expect(result!.version).toBeDefined();
    expect(result!.hash).toBeDefined();
    expect(result!.timestamp).toBeDefined();
    expect(result!.assets).toBeDefined();
    expect(typeof result!.assets).toBe("object");
  });

  test("parseLatestJson returns null for invalid JSON", () => {
    const result = parseLatestJson("not json");
    expect(result).toBeNull();
  });

  test("parseLatestJson returns null for missing required fields", () => {
    // Missing hash and assets
    const result = parseLatestJson('{ "version": "1.0" }');
    expect(result).toBeNull();
  });
});

describe("version comparison", () => {
  test("needsUpdate returns true when no current version", () => {
    const latest = {
      version: "1.0.0",
      hash: "abc123def456",
      timestamp: new Date().toISOString(),
      assets: {},
    };

    const result = needsUpdate(null, latest);
    expect(result).toBe(true);
  });

  test("needsUpdate returns true when hashes differ", () => {
    const latest = {
      version: "1.0.0",
      hash: "bbb",
      timestamp: new Date().toISOString(),
      assets: {},
    };

    const result = needsUpdate("aaa", latest);
    expect(result).toBe(true);
  });

  test("needsUpdate returns false when hashes match", () => {
    const latest = {
      version: "1.0.0",
      hash: "abc",
      timestamp: new Date().toISOString(),
      assets: {},
    };

    const result = needsUpdate("abc", latest);
    expect(result).toBe(false);
  });
});

describe("platform detection", () => {
  test("getPlatformKey returns valid platform string", () => {
    const key = getPlatformKey();
    expect(["linux-x64", "linux-arm64", "darwin-arm64", "darwin-x64", "win-x64"]).toContain(key);
  });
});

describe("gzip extraction and verification", () => {
  test("extractAndVerify extracts gzip and verifies SHA256", () => {
    const tempDir = createTempDir();
    const destPath = join(tempDir, "core");

    const gzipData = loadFixture("fake-core.gz");
    const latestJson = JSON.parse(loadTextFixture("latest.json"));
    const platformKey = getPlatformKey();
    const expectedSha256 = latestJson.assets[platformKey]?.sha256;

    // Skip if platform not in fixtures
    if (!expectedSha256) {
      console.log("Skipping: platform not in fixtures");
      return;
    }

    const result = extractAndVerify(gzipData, destPath, expectedSha256);

    expect(result).toBe(true);
    expect(existsSync(destPath)).toBe(true);
  });

  test("extractAndVerify returns false for SHA256 mismatch", () => {
    const tempDir = createTempDir();
    const destPath = join(tempDir, "core");

    const gzipData = loadFixture("fake-core.gz");
    const wrongSha256 = "0".repeat(64); // Fake SHA256

    const result = extractAndVerify(gzipData, destPath, wrongSha256);

    expect(result).toBe(false);
    // File should be deleted on failure
    expect(existsSync(destPath)).toBe(false);
  });

  test("extractAndVerify sets executable permission", () => {
    // Skip on Windows
    if (process.platform === "win32") {
      console.log("Skipping: Windows does not support Unix permissions");
      return;
    }

    const tempDir = createTempDir();
    const destPath = join(tempDir, "core");

    const gzipData = loadFixture("fake-core.gz");
    const latestJson = JSON.parse(loadTextFixture("latest.json"));
    const platformKey = getPlatformKey();
    const expectedSha256 = latestJson.assets[platformKey]?.sha256;

    if (!expectedSha256) {
      console.log("Skipping: platform not in fixtures");
      return;
    }

    const result = extractAndVerify(gzipData, destPath, expectedSha256);
    expect(result).toBe(true);

    const stats = statSync(destPath);
    // Check that executable bit is set (at least for user)
    expect(stats.mode & 0o100).toBeTruthy();
  });
});

describe("symlink management", () => {
  test("updateCurrentLink creates symlink to release directory", () => {
    const tempDir = createTempDir();
    const hash = "abc123def456";

    // Create bin/<hash>/core structure
    const binDir = join(tempDir, "bin", hash);
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, "core"), "dummy");

    // Create symlink
    updateCurrentLink(tempDir, hash);

    // Verify symlink exists and points to correct target
    const currentPath = join(tempDir, "bin", "current");
    expect(existsSync(currentPath)).toBe(true);

    const stats = Bun.file(currentPath).size; // Will follow symlink
    expect(existsSync(join(currentPath, "core"))).toBe(true);
  });

  test("updateCurrentLink replaces existing symlink", () => {
    const tempDir = createTempDir();
    const oldHash = "old-hash-123";
    const newHash = "new-hash-456";

    // Create both hash directories
    const oldBinDir = join(tempDir, "bin", oldHash);
    const newBinDir = join(tempDir, "bin", newHash);
    mkdirSync(oldBinDir, { recursive: true });
    mkdirSync(newBinDir, { recursive: true });
    writeFileSync(join(oldBinDir, "core"), "old");
    writeFileSync(join(newBinDir, "core"), "new");

    // Create initial symlink to old hash
    updateCurrentLink(tempDir, oldHash);

    // Update symlink to new hash
    updateCurrentLink(tempDir, newHash);

    // Verify current points to new hash
    const currentPath = join(tempDir, "bin", "current");
    const coreContent = readFileSync(join(currentPath, "core"), "utf-8");
    expect(coreContent).toBe("new");

    // Verify old hash directory is preserved
    expect(existsSync(oldBinDir)).toBe(true);
    expect(existsSync(join(oldBinDir, "core"))).toBe(true);
  });
});
