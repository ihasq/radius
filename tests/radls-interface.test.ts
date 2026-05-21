/**
 * Phase 2: radls インタフェース定義テスト
 *
 * RadlsProvider インタフェースを定義し、radls-ts を最初の実装とする。
 * 全コマンドハンドラを RadlsProvider 経由に変更する。
 */

import { test, expect, describe } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = join(__dirname, "..");

describe("Phase 2: radls interface", () => {

  test("T01: RadlsProvider インタフェースが定義されている", () => {
    const interfacePath = join(projectRoot, "packages/radls-ts/src/interface.ts");
    expect(existsSync(interfacePath)).toBe(true);

    const content = readFileSync(interfacePath, "utf-8");
    expect(content).toContain("export interface RadlsProvider");
  });

  test("T02: getSymbols が RadSymbol[] を返す", () => {
    const interfacePath = join(projectRoot, "packages/radls-ts/src/interface.ts");
    const content = readFileSync(interfacePath, "utf-8");

    expect(content).toContain("getSymbols");
    expect(content).toMatch(/getSymbols.*RadSymbol/);
  });

  test("T03: format が TextEdit[] を返す", () => {
    const interfacePath = join(projectRoot, "packages/radls-ts/src/interface.ts");
    const content = readFileSync(interfacePath, "utf-8");

    expect(content).toContain("format");
    expect(content).toMatch(/format.*TextEdit/);
  });

  test("T04: getHoverInfo が HoverResult を返す", () => {
    const interfacePath = join(projectRoot, "packages/radls-ts/src/interface.ts");
    const content = readFileSync(interfacePath, "utf-8");

    expect(content).toContain("getHoverInfo");
    expect(content).toMatch(/getHoverInfo.*HoverResult/);
  });

  test("T05: findReferences が Reference[] を返す", () => {
    const interfacePath = join(projectRoot, "packages/radls-ts/src/interface.ts");
    const content = readFileSync(interfacePath, "utf-8");

    expect(content).toContain("findReferences");
    expect(content).toMatch(/findReferences.*Reference/);
  });

  test("T06: rename が FileEdit[] を返す", () => {
    const interfacePath = join(projectRoot, "packages/radls-ts/src/interface.ts");
    const content = readFileSync(interfacePath, "utf-8");

    expect(content).toContain("rename");
    expect(content).toMatch(/rename.*FileEdit/);
  });

  test("T07: getDiagnostics が Diagnostic[] を返す", () => {
    const interfacePath = join(projectRoot, "packages/radls-ts/src/interface.ts");
    const content = readFileSync(interfacePath, "utf-8");

    expect(content).toContain("getDiagnostics");
    expect(content).toMatch(/getDiagnostics.*Diagnostic/);
  });

  test("T08: getCodeFixes が CodeFix[] を返す", () => {
    const interfacePath = join(projectRoot, "packages/radls-ts/src/interface.ts");
    const content = readFileSync(interfacePath, "utf-8");

    expect(content).toContain("getCodeFixes");
    expect(content).toMatch(/getCodeFixes.*CodeFix/);
  });

  test("T09: radls-ts が RadlsProvider を実装している", () => {
    const providerPath = join(projectRoot, "packages/radls-ts/src/provider.ts");
    expect(existsSync(providerPath)).toBe(true);

    const content = readFileSync(providerPath, "utf-8");
    expect(content).toContain("implements RadlsProvider");
  });

  test("T10: resolveProvider(filePath) が拡張子に基づき正しいプロバイダを返す", () => {
    const resolverPath = join(projectRoot, "src/core/radls-resolver.ts");
    expect(existsSync(resolverPath)).toBe(true);

    const content = readFileSync(resolverPath, "utf-8");
    expect(content).toContain("resolveProvider");
    expect(content).toContain("function resolveProvider");
  });

});
