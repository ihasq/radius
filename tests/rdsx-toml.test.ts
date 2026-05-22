/**
 * Phase 10: RDSX Specification Solidification Tests
 *
 * 14 tests covering:
 * - Group A: rdsx.toml parser (T01-T04)
 * - Group B: Import prefix resolution (T05-T09)
 * - Group C: RDSX loader (T10-T12)
 * - Group D: Existing extension toml conversion (T13-T14)
 */

import { describe, test, expect } from "bun:test";
import { join } from "path";
import { existsSync } from "fs";

const fixtureDir = join(__dirname, "fixtures/rdsx-extension");
const tomlPath = join(fixtureDir, "rdsx.toml");

describe("Group A: rdsx.toml parser", () => {
  test("T01: parse rdsx.toml and return extension.name", () => {
    const { parseRdsxToml } = require("../src/rdsx/toml-parser");
    const config = parseRdsxToml(tomlPath);
    expect(config.extension.name).toBe("rdsx-test");
  });

  test("T02: parse rdsx.toml and return extension.kind", () => {
    const { parseRdsxToml } = require("../src/rdsx/toml-parser");
    const config = parseRdsxToml(tomlPath);
    expect(config.extension.kind).toBe("analyzer");
  });

  test("T03: parse rdsx.toml and return analyzer.language_ids as array", () => {
    const { parseRdsxToml } = require("../src/rdsx/toml-parser");
    const config = parseRdsxToml(tomlPath);
    expect(Array.isArray(config.analyzer?.language_ids)).toBe(true);
    expect(config.analyzer?.language_ids).toContain("test");
  });

  test("T04: throw error when rdsx.toml does not exist", () => {
    const { parseRdsxToml } = require("../src/rdsx/toml-parser");
    expect(() => parseRdsxToml("/nonexistent/rdsx.toml")).toThrow();
  });
});

describe("Group B: Import prefix resolution", () => {
  test("T05: resolve npm:typescript to node_modules path", () => {
    const { resolvePrefix } = require("../src/rdsx/prefix-resolver");
    const resolved = resolvePrefix("npm:typescript", process.env.HOME + "/.radius");
    expect(resolved).toContain("node_modules");
    expect(resolved).toContain("typescript");
  });

  test("T06: resolve jsr:@std/schema to cache path", () => {
    const { resolvePrefix } = require("../src/rdsx/prefix-resolver");
    const radiusHome = process.env.HOME + "/.radius";
    const resolved = resolvePrefix("jsr:@std/schema", radiusHome);
    expect(resolved).toContain("rdsx-cache/jsr");
    expect(resolved).toContain("@std/schema");
  });

  test("T07: resolve https://deno.land/std/http/server.ts to cache path", () => {
    const { resolvePrefix } = require("../src/rdsx/prefix-resolver");
    const radiusHome = process.env.HOME + "/.radius";
    const resolved = resolvePrefix("https://deno.land/std/http/server.ts", radiusHome);
    expect(resolved).toContain("rdsx-cache/https");
    expect(resolved).toContain("deno.land");
  });

  test("T08: resolve gh:user/repo/src/parser.ts to cache path", () => {
    const { resolvePrefix } = require("../src/rdsx/prefix-resolver");
    const radiusHome = process.env.HOME + "/.radius";
    const resolved = resolvePrefix("gh:user/repo/src/parser.ts", radiusHome);
    expect(resolved).toContain("rdsx-cache/gh");
    expect(resolved).toContain("user/repo");
  });

  test("T09: throw error for unknown prefix xyz:foo", () => {
    const { resolvePrefix } = require("../src/rdsx/prefix-resolver");
    const radiusHome = process.env.HOME + "/.radius";
    expect(() => resolvePrefix("xyz:foo", radiusHome)).toThrow(/Unknown import prefix/);
  });
});

describe("Group C: RDSX loader", () => {
  test("T10: dynamically import activate() from entry file", async () => {
    const entryPath = join(fixtureDir, "src/main.ts");
    const mod = await import(entryPath);
    expect(typeof mod.activate).toBe("function");
  });

  test("T11: extension code with npm: imports can be resolved", () => {
    const { parseImportSpecifier } = require("../src/rdsx/prefix-resolver");
    const parsed = parseImportSpecifier("npm:typescript");
    expect(parsed.prefix).toBe("npm");
    expect(parsed.path).toBe("typescript");
  });

  test("T12: RdsxRegistry.loadFromToml registers extension", async () => {
    const { RdsxRegistry } = require("../src/rdsx/registry");
    const { loadFromToml } = require("../src/rdsx/loader");

    const registry = new RdsxRegistry();
    const radiusHome = process.env.HOME + "/.radius";

    await loadFromToml(tomlPath, registry, radiusHome);

    const analyzer = registry.getAnalyzer("test");
    expect(analyzer).not.toBeNull();
  });
});

describe("Group D: Existing extension toml conversion", () => {
  test("T13: packages/rdsx-ts/rdsx.toml exists and kind = analyzer", () => {
    const tsTomlPath = join(__dirname, "../packages/rdsx-ts/rdsx.toml");
    expect(existsSync(tsTomlPath)).toBe(true);

    const { parseRdsxToml } = require("../src/rdsx/toml-parser");
    const config = parseRdsxToml(tsTomlPath);
    expect(config.extension.kind).toBe("analyzer");
  });

  test("T14: packages/rdsx-rs/rdsx.toml exists and kind = analyzer", () => {
    const rsTomlPath = join(__dirname, "../packages/rdsx-rs/rdsx.toml");
    expect(existsSync(rsTomlPath)).toBe(true);

    const { parseRdsxToml } = require("../src/rdsx/toml-parser");
    const config = parseRdsxToml(rsTomlPath);
    expect(config.extension.kind).toBe("analyzer");
  });
});
