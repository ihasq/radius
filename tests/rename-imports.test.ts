/**
 * Rename File Import Resolution Test
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { radius, extractTag } from "./helpers/radius";
import { setupFixture, cleanupFixture, readFixtureFile } from "./helpers/fixtures";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { join } from "node:path";
import { existsSync } from "node:fs";

let tmpDir: string;

beforeAll(async () => {
  setupTestRadiusHome("rename-imports");
});

afterAll(async () => {
  cleanupTestRadiusHome();
});

beforeEach(async () => {
  tmpDir = await setupFixture("ts-project");
});

afterEach(async () => {
  await cleanupFixture(tmpDir);
});

describe("rename-file import resolution", () => {
  test("updates import in referencing file", async () => {
    const oldPath = join(tmpDir, "src/utils.ts");
    const newPath = join(tmpDir, "src/helpers.ts");

    const result = await radius([
      "rename-file",
      oldPath,
      newPath,
    ], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/renamed|success/i);

    // ファイルが移動している
    expect(existsSync(newPath)).toBe(true);
    expect(existsSync(oldPath)).toBe(false);

    // main.ts の import が更新されているか確認
    // main.ts は utils.ts を直接インポートしていないが、
    // re-exporter.ts が utils.ts をインポートしている
    const reexporterContent = readFixtureFile(tmpDir, "src/re-exporter.ts");
    expect(reexporterContent).toContain("./helpers");
    expect(reexporterContent).not.toContain("./utils");

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  });

  test("updates multiple references in same file", async () => {
    // re-exporter.ts は同じモジュールに対してimportとexportがある
    const oldPath = join(tmpDir, "src/utils.ts");
    const newPath = join(tmpDir, "src/helpers.ts");

    const result = await radius([
      "rename-file",
      oldPath,
      newPath,
    ], { cwd: tmpDir });

    const reexporterContent = readFixtureFile(tmpDir, "src/re-exporter.ts");

    // import も export も更新されている
    const helpersMatches = reexporterContent.match(/helpers/g);
    expect(helpersMatches).toBeTruthy();
    expect(reexporterContent).not.toContain("utils");

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  });

  test("updates self-imports when file moves directory", async () => {
    const oldPath = join(tmpDir, "src/lib/helpers.ts");
    const newPath = join(tmpDir, "src/moved-helpers.ts");

    const result = await radius([
      "rename-file",
      oldPath,
      newPath,
    ], { cwd: tmpDir });

    // helpers.ts 内の import "./constants" は影響を受ける
    const movedContent = readFixtureFile(tmpDir, "src/moved-helpers.ts");

    // 相対パスが更新されている
    expect(movedContent).toContain("./lib/constants");

    // main.ts の import も更新されている
    const mainContent = readFixtureFile(tmpDir, "src/main.ts");
    expect(mainContent).toContain("./moved-helpers");
    expect(mainContent).not.toContain("./lib/helpers");

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  });

  test("preserves import specifier extension style", async () => {
    const oldPath = join(tmpDir, "src/utils.ts");
    const newPath = join(tmpDir, "src/helpers.ts");

    const result = await radius([
      "rename-file",
      oldPath,
      newPath,
    ], { cwd: tmpDir });

    const reexporterContent = readFixtureFile(tmpDir, "src/re-exporter.ts");

    // 元が "./utils" (拡張子なし) なら、"./helpers" (拡張子なし) になる
    expect(reexporterContent).toContain("./helpers");
    expect(reexporterContent).not.toContain("./helpers.ts");
    expect(reexporterContent).not.toContain("./helpers.js");

    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });
  });

  test("handles file with no references", async () => {
    // constants.ts は他のファイルからインポートされているが、
    // 新しいファイルを作って、それをリネームする
    const newFile = join(tmpDir, "src/isolated.ts");

    const r1 = await radius([
      "create",
      newFile,
      "--content",
      "export const isolated = true;",
    ], { cwd: tmpDir });

    const renamedFile = join(tmpDir, "src/renamed.ts");

    const r2 = await radius([
      "rename-file",
      newFile,
      renamedFile,
      "--tag",
      extractTag(r1.stdout),
    ], { cwd: tmpDir });

    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toMatch(/imports updated:\s*0/i);

    // ファイルは移動している
    expect(existsSync(renamedFile)).toBe(true);
    expect(existsSync(newFile)).toBe(false);

    const r3 = await radius(["undo", "--tag", extractTag(r2.stdout)], { cwd: tmpDir });
    await radius(["undo", "--tag", extractTag(r3.stdout)], { cwd: tmpDir });
  });

  test("undo restores original file and all imports", async () => {
    const oldPath = join(tmpDir, "src/utils.ts");
    const newPath = join(tmpDir, "src/helpers.ts");

    // 変更前の内容を保存
    const beforeReexporter = readFixtureFile(tmpDir, "src/re-exporter.ts");

    // rename実行
    const result = await radius([
      "rename-file",
      oldPath,
      newPath,
    ], { cwd: tmpDir });

    // undo
    await radius(["undo", "--tag", extractTag(result.stdout)], { cwd: tmpDir });

    // 元のファイルが存在
    expect(existsSync(oldPath)).toBe(true);
    expect(existsSync(newPath)).toBe(false);

    // import が復元されている
    const afterReexporter = readFixtureFile(tmpDir, "src/re-exporter.ts");
    expect(afterReexporter).toBe(beforeReexporter);
    expect(afterReexporter).toContain("./utils");
  });
});
