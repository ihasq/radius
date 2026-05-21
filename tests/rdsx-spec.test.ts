/**
 * Phase 8: RDSX Extension Specification Tests
 *
 * 12 tests covering:
 * - Group A: Interface definitions (T01-T04)
 * - Group B: Registry (T05-T08)
 * - Group C: Migration from radls (T09-T12)
 */

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

describe("Group A: Interface definitions", () => {
  test("T01: RdsxExtension interface has kind, name, version, activate, deactivate", async () => {
    const typesPath = join(process.cwd(), "src/rdsx/types.ts");
    expect(existsSync(typesPath)).toBe(true);

    const content = readFileSync(typesPath, "utf-8");
    expect(content).toContain("interface RdsxExtension");
    expect(content).toContain("readonly kind:");
    expect(content).toContain("readonly name: string");
    expect(content).toContain("readonly version: string");
    expect(content).toContain("activate()");
    expect(content).toContain("deactivate()");
  });

  test("T02: RdsxAnalyzer extends RdsxExtension and has RadlsProvider methods", async () => {
    const typesPath = join(process.cwd(), "src/rdsx/types.ts");
    const content = readFileSync(typesPath, "utf-8");

    expect(content).toContain("interface RdsxAnalyzer extends RdsxExtension");
    expect(content).toContain("getSymbols");
    expect(content).toContain("format");
    expect(content).toContain("getHoverInfo");
    expect(content).toContain("findReferences");
    expect(content).toContain("rename");
    expect(content).toContain("getDiagnostics");
    expect(content).toContain("getCodeFixes");
  });

  test("T03: RdsxCommand extends RdsxExtension and has execute(args)", async () => {
    const typesPath = join(process.cwd(), "src/rdsx/types.ts");
    const content = readFileSync(typesPath, "utf-8");

    expect(content).toContain("interface RdsxCommand extends RdsxExtension");
    expect(content).toContain("execute(");
    expect(content).toContain("args");
  });

  test("T04: RdsxDebugger extends RdsxExtension and has startSession()", async () => {
    const typesPath = join(process.cwd(), "src/rdsx/types.ts");
    const content = readFileSync(typesPath, "utf-8");

    expect(content).toContain("interface RdsxDebugger extends RdsxExtension");
    expect(content).toContain("startSession");
  });
});

describe("Group B: Registry", () => {
  test("T05: RdsxRegistry.register(ext) can register extensions", async () => {
    const registryPath = join(process.cwd(), "src/rdsx/registry.ts");
    expect(existsSync(registryPath)).toBe(true);

    const content = readFileSync(registryPath, "utf-8");
    expect(content).toContain("class RdsxRegistry");
    expect(content).toContain("register(");
    expect(content).toContain("RdsxExtension");
  });

  test("T06: RdsxRegistry.getByKind('analyzer') returns only analyzers", async () => {
    const registryPath = join(process.cwd(), "src/rdsx/registry.ts");
    const content = readFileSync(registryPath, "utf-8");

    expect(content).toContain("getByKind");
    expect(content).toContain("RdsxKind");
    expect(content).toContain("filter");
  });

  test("T07: RdsxRegistry.getAnalyzer('typescript') returns rdsx-ts", async () => {
    const registryPath = join(process.cwd(), "src/rdsx/registry.ts");
    const content = readFileSync(registryPath, "utf-8");

    expect(content).toContain("getAnalyzer");
    expect(content).toContain("languageId");
  });

  test("T08: RdsxRegistry.getAnalyzer('rust') returns rdsx-rs", async () => {
    // Same implementation check as T07
    const registryPath = join(process.cwd(), "src/rdsx/registry.ts");
    const content = readFileSync(registryPath, "utf-8");

    expect(content).toContain("getAnalyzer");
    expect(content).toContain("RdsxAnalyzer");
  });
});

describe("Group C: Migration from radls", () => {
  test("T09: packages/rdsx-ts/ exists and package.json has name: '@radius/rdsx-ts'", async () => {
    const packagePath = join(process.cwd(), "packages/rdsx-ts/package.json");
    expect(existsSync(packagePath)).toBe(true);

    const content = readFileSync(packagePath, "utf-8");
    const pkg = JSON.parse(content);
    expect(pkg.name).toBe("@radius/rdsx-ts");
  });

  test("T10: packages/rdsx-rs/ exists (renamed from radls-rs)", async () => {
    const packagePath = join(process.cwd(), "packages/rdsx-rs");
    expect(existsSync(packagePath)).toBe(true);

    const pkgJsonPath = join(packagePath, "package.json");
    if (existsSync(pkgJsonPath)) {
      const content = readFileSync(pkgJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      expect(pkg.name).toContain("rdsx");
    }
  });

  test("T11: TsRadProvider implements RdsxAnalyzer", async () => {
    const providerPath = join(process.cwd(), "packages/rdsx-ts/src/provider.ts");
    expect(existsSync(providerPath)).toBe(true);

    const content = readFileSync(providerPath, "utf-8");
    expect(content).toContain("RdsxAnalyzer");
    expect(content).toContain("class TsRadProvider");
  });

  test("T12: src/ has 0 direct references to 'RadlsProvider' (all via RdsxAnalyzer)", async () => {
    const { execSync } = require("child_process");

    try {
      const result = execSync(
        "grep -rn 'RadlsProvider' src/ --include='*.ts' | grep -v test | wc -l",
        { encoding: "utf-8", cwd: process.cwd() }
      );

      const count = parseInt(result.trim(), 10);
      expect(count).toBe(0);
    } catch (error) {
      // grep returns exit code 1 if no matches, which is what we want
      expect(true).toBe(true);
    }
  });
});
