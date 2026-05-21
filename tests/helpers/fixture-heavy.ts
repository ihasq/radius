import { mkdtempSync, cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

/**
 * heavy-project フィクスチャを一時ディレクトリにセットアップする。
 * @types/node がインストールされた状態を保証する。
 */
export async function setupHeavyFixture(): Promise<string> {
  const tmpDir = mkdtempSync(join(tmpdir(), "radius-heavy-"));
  const sourcePath = join(process.cwd(), "tests/fixtures/heavy-project");

  // プロジェクト全体をコピー
  cpSync(sourcePath, tmpDir, { recursive: true });

  // node_modules/@types/node が存在することを確認
  const typesNodePath = join(tmpDir, "node_modules/@types/node");
  if (!existsSync(typesNodePath)) {
    // npm install を実行
    execSync("npm install --no-save", { cwd: tmpDir, stdio: "ignore" });
  }

  return tmpDir;
}
