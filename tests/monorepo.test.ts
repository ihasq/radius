/**
 * Phase 1: モノレポ構造テスト
 *
 * ts-service を packages/radls-ts/ に移動し、
 * 将来の radls-rs/cpp/go/zig と同一構造にする。
 */

import { test, expect, describe } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = join(__dirname, "..");

describe("Phase 1: monorepo structure", () => {

  test("T01: packages/ ディレクトリが存在する", () => {
    const packagesDir = join(projectRoot, "packages");
    expect(existsSync(packagesDir)).toBe(true);
  });

  test("T02: packages/radls-ts/package.json に name, version, main がある", () => {
    const pkgPath = join(projectRoot, "packages/radls-ts/package.json");
    expect(existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.name).toBe("@radius/radls-ts");
    expect(pkg.version).toBeDefined();
    expect(pkg.main).toBeDefined();
  });

  test("T03: packages/radls-ts/src/ に TsRad クラスがある", () => {
    const indexPath = join(projectRoot, "packages/radls-ts/src/index.ts");
    expect(existsSync(indexPath)).toBe(true);

    const content = readFileSync(indexPath, "utf-8");
    expect(content).toContain("export class TsRad");
  });

  test("T04: core から packages/radls-ts を import できる", () => {
    // コンパイル時のチェックのため、実際の import テスト
    const outlinePath = join(projectRoot, "src/core/commands/outline.ts");
    expect(existsSync(outlinePath)).toBe(true);

    const content = readFileSync(outlinePath, "utf-8");
    // packages/radls-ts からの import を使用していることを確認
    expect(content).toMatch(/from.*radls-ts/);
  });

  test("T05: RadlsProvider インタフェースが export されている", () => {
    const interfacePath = join(projectRoot, "packages/radls-ts/src/interface.ts");
    expect(existsSync(interfacePath)).toBe(true);

    const content = readFileSync(interfacePath, "utf-8");
    expect(content).toContain("export interface RadlsProvider");
  });

  test("T06: 旧パス src/core/ts-service/ が存在しない", () => {
    const oldPath = join(projectRoot, "src/core/ts-service");
    expect(existsSync(oldPath)).toBe(false);
  });

});
