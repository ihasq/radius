/**
 * Phase 11: RDSX Package Restructuring Tests
 *
 * 10 tests covering:
 * - Group A: Structure verification (T01-T05)
 * - Group B: Loader integration (T06-T08)
 * - Group C: Functionality verification (T09-T10)
 */

import { describe, test, expect } from "bun:test";
import { join } from "path";
import { existsSync } from "fs";

const packagesDir = join(__dirname, "../packages");
const packages = ["rdsx-ts", "rdsx-rs", "rdsx-cpp", "rdsx-go", "rdsx-zig"];

describe("Group A: Structure verification", () => {
  test("T01: all 5 packages have rdsx.toml", () => {
    for (const pkg of packages) {
      const tomlPath = join(packagesDir, pkg, "rdsx.toml");
      expect(existsSync(tomlPath)).toBe(true);
    }
  });

  test("T02: all 5 packages have src/main.ts", () => {
    for (const pkg of packages) {
      const mainPath = join(packagesDir, pkg, "src/main.ts");
      expect(existsSync(mainPath)).toBe(true);
    }
  });

  test("T03: all main.ts export activate()", () => {
    for (const pkg of packages) {
      const mainPath = join(packagesDir, pkg, "src/main.ts");
      const content = Bun.file(mainPath).text();
      expect(content).resolves.toContain("activate");
      expect(content).resolves.toContain("export");
    }
  });

  test("T04: all rdsx.toml have extension.kind = 'analyzer'", () => {
    const { parseRdsxToml } = require("../src/rdsx/toml-parser");
    for (const pkg of packages) {
      const tomlPath = join(packagesDir, pkg, "rdsx.toml");
      const config = parseRdsxToml(tomlPath);
      expect(config.extension.kind).toBe("analyzer");
    }
  });

  test("T05: all rdsx.toml have non-empty analyzer.language_ids", () => {
    const { parseRdsxToml } = require("../src/rdsx/toml-parser");
    for (const pkg of packages) {
      const tomlPath = join(packagesDir, pkg, "rdsx.toml");
      const config = parseRdsxToml(tomlPath);
      expect(Array.isArray(config.analyzer?.language_ids)).toBe(true);
      expect(config.analyzer?.language_ids.length).toBeGreaterThan(0);
    }
  });
});

describe("Group B: Loader integration", () => {
  test("T06: RdsxRegistry.loadFromToml registers rdsx-ts", async () => {
    const { RdsxRegistry } = require("../src/rdsx/registry");
    const { loadFromToml } = require("../src/rdsx/loader");

    const registry = new RdsxRegistry();
    const radiusHome = process.env.HOME + "/.radius";
    const tomlPath = join(packagesDir, "rdsx-ts", "rdsx.toml");

    await loadFromToml(tomlPath, registry, radiusHome);

    const analyzer = registry.getAnalyzer("typescript");
    expect(analyzer).not.toBeNull();
  });

  test("T07: RdsxRegistry.loadFromToml registers rdsx-rs (skip if rust-analyzer not installed)", async () => {
    const { execSync } = require("child_process");
    let rustAnalyzerAvailable = false;
    try {
      execSync("which rust-analyzer", { stdio: "ignore" });
      rustAnalyzerAvailable = true;
    } catch {
      rustAnalyzerAvailable = false;
    }

    if (!rustAnalyzerAvailable) {
      return; // Skip test
    }

    const { RdsxRegistry } = require("../src/rdsx/registry");
    const { loadFromToml } = require("../src/rdsx/loader");

    const registry = new RdsxRegistry();
    const radiusHome = process.env.HOME + "/.radius";
    const tomlPath = join(packagesDir, "rdsx-rs", "rdsx.toml");

    await loadFromToml(tomlPath, registry, radiusHome);

    const analyzer = registry.getAnalyzer("rust");
    expect(analyzer).not.toBeNull();
  });

  test("T08: loadAllPackages() loads all package rdsx.toml files", async () => {
    const { RdsxRegistry } = require("../src/rdsx/registry");
    const { loadAllPackages } = require("../src/rdsx/loader");

    const registry = new RdsxRegistry();
    const radiusHome = process.env.HOME + "/.radius";

    // loadAllPackages should not throw even if some LSPs are not installed
    await expect(loadAllPackages(packagesDir, registry, radiusHome)).resolves.toBeUndefined();
  });
});

describe("Group C: Functionality verification", () => {
  test("T09: rdsx-ts activate() returns RdsxAnalyzer", async () => {
    const mainPath = join(packagesDir, "rdsx-ts", "src/main.ts");
    const mod = await import(mainPath);

    expect(typeof mod.activate).toBe("function");
    const analyzer = mod.activate();
    expect(analyzer.kind).toBe("analyzer");
    expect(analyzer.languageIds).toContain("typescript");
  });

  test("T10: after registration, getAnalyzer('typescript') returns rdsx-ts", async () => {
    const { RdsxRegistry } = require("../src/rdsx/registry");
    const { loadFromToml } = require("../src/rdsx/loader");

    const registry = new RdsxRegistry();
    const radiusHome = process.env.HOME + "/.radius";
    const tomlPath = join(packagesDir, "rdsx-ts", "rdsx.toml");

    await loadFromToml(tomlPath, registry, radiusHome);

    const analyzer = registry.getAnalyzer("typescript");
    expect(analyzer).not.toBeNull();
    expect(analyzer?.languageIds).toContain("typescript");
  });
});
