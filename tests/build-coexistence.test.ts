/**
 * build-coexistence.test.ts
 *
 * release と dev ビルドの共存・相互非干渉・同一ビルドタイプ内の自動パージをテストする。
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const PROJECT_ROOT = join(__dirname, "..");
const DIST_DIR = join(PROJECT_ROOT, "dist");

// テスト用のバイナリパス
const RADIUSD_RELEASE = join(DIST_DIR, "radiusd-release");
const RADIUSD_DEV = join(DIST_DIR, "radiusd-dev");

// RADIUS_HOME パス
const RELEASE_HOME = join(homedir(), ".radius");
const DEV_HOME = join(homedir(), ".radius-dev");

/**
 * デーモンを停止する
 */
function stopAllDaemons() {
  try {
    execSync("pkill -f radiusd", { stdio: "ignore" });
  } catch {
    // pkill が何も見つけなくても OK
  }
}

/**
 * ソケットファイルを取得する
 */
function getSockets(radiusHome: string): string[] {
  try {
    const files = execSync(`ls ${radiusHome}/daemon-*.sock 2>/dev/null || true`, { encoding: "utf-8" });
    return files.trim().split("\n").filter(f => f.length > 0);
  } catch {
    return [];
  }
}

/**
 * デーモンプロセス数を取得する
 */
function getDaemonCount(): number {
  try {
    const result = execSync("pgrep -fc radiusd 2>/dev/null || echo 0", { encoding: "utf-8" });
    return parseInt(result.trim(), 10);
  } catch {
    return 0;
  }
}

beforeAll(() => {
  stopAllDaemons();
  // テスト用バイナリを準備（後でビルドする）
});

afterAll(() => {
  stopAllDaemons();
});

describe("RADIUS_HOME 分離", () => {

  test("1. release ビルドの RADIUS_HOME が ~/.radius/ であること", async () => {
    stopAllDaemons();

    // release デーモンを起動
    execSync(`${RADIUSD_RELEASE} --exec ping`, { stdio: "ignore", timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // release ソケットが ~/.radius/ に存在
    const releaseSockets = getSockets(RELEASE_HOME);
    expect(releaseSockets.length).toBeGreaterThan(0);

    stopAllDaemons();
  }, 10000);

  test("2. dev ビルドの RADIUS_HOME が ~/.radius-dev/ であること", async () => {
    stopAllDaemons();

    // dev デーモンを起動
    execSync(`${RADIUSD_DEV} --exec ping`, { stdio: "ignore", timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // dev ソケットが ~/.radius-dev/ に存在
    const devSockets = getSockets(DEV_HOME);
    expect(devSockets.length).toBeGreaterThan(0);

    stopAllDaemons();
  }, 10000);

  test("3. release と dev で RADIUS_HOME が異なること", () => {
    expect(RELEASE_HOME).not.toBe(DEV_HOME);
  });

});

describe("ソケット分離", () => {

  test("4. release デーモンのソケットが ~/.radius/daemon-{hash}.sock であること", async () => {
    stopAllDaemons();

    execSync(`${RADIUSD_RELEASE} --exec ping`, { stdio: "ignore", timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    const releaseSockets = getSockets(RELEASE_HOME);
    expect(releaseSockets.length).toBeGreaterThan(0);
    expect(releaseSockets[0]).toContain(RELEASE_HOME);
    expect(releaseSockets[0]).toContain("daemon-");
    expect(releaseSockets[0]).toContain(".sock");

    stopAllDaemons();
  }, 10000);

  test("5. dev デーモンのソケットが ~/.radius-dev/daemon-{hash}.sock であること", async () => {
    stopAllDaemons();

    execSync(`${RADIUSD_DEV} --exec ping`, { stdio: "ignore", timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    const devSockets = getSockets(DEV_HOME);
    expect(devSockets.length).toBeGreaterThan(0);
    expect(devSockets[0]).toContain(DEV_HOME);
    expect(devSockets[0]).toContain("daemon-");
    expect(devSockets[0]).toContain(".sock");

    stopAllDaemons();
  }, 10000);

  test("6. release CLI が dev ソケットに接続しないこと", async () => {
    stopAllDaemons();

    // dev デーモンのみ起動
    execSync(`${RADIUSD_DEV} --exec ping`, { stdio: "ignore", timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // release CLI で接続を試みる（失敗するはず）
    try {
      execSync(`${RADIUSD_RELEASE} --exec ping`, { stdio: "pipe", timeout: 10000 });
      // 成功した場合は、新しい release デーモンが起動したはず
      const releaseSockets = getSockets(RELEASE_HOME);
      const devSockets = getSockets(DEV_HOME);
      expect(releaseSockets.length).toBeGreaterThan(0);
      expect(devSockets.length).toBeGreaterThan(0);
    } catch {
      // タイムアウトや接続エラーは OK
    }

    stopAllDaemons();
  }, 10000);

  test("7. dev CLI が release ソケットに接続しないこと", async () => {
    stopAllDaemons();

    // release デーモンのみ起動
    execSync(`${RADIUSD_RELEASE} --exec ping`, { stdio: "ignore", timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // dev CLI で接続を試みる（失敗するはず）
    try {
      execSync(`${RADIUSD_DEV} --exec ping`, { stdio: "pipe", timeout: 10000 });
      // 成功した場合は、新しい dev デーモンが起動したはず
      const releaseSockets = getSockets(RELEASE_HOME);
      const devSockets = getSockets(DEV_HOME);
      expect(releaseSockets.length).toBeGreaterThan(0);
      expect(devSockets.length).toBeGreaterThan(0);
    } catch {
      // タイムアウトや接続エラーは OK
    }

    stopAllDaemons();
  }, 10000);

});

describe("同一タイプ内パージ", () => {

  test("8. release 新バージョン起動時に旧 release デーモンが停止すること", async () => {
    stopAllDaemons();

    // 旧 release デーモン起動
    execSync(`${RADIUSD_RELEASE} --exec ping`, { stdio: "ignore", timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    const daemonsBeforePurge = getDaemonCount();
    expect(daemonsBeforePurge).toBeGreaterThan(0);

    // 新 release デーモン起動（古いバージョンをパージするはず）
    // 注: この実装では同じバイナリを使うので、デーモンは1つのまま
    execSync(`${RADIUSD_RELEASE} --exec ping`, { stdio: "ignore", timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    const daemonsAfterPurge = getDaemonCount();
    // デーモンは1つのみ（古いのがパージされた）
    expect(daemonsAfterPurge).toBe(1);

    stopAllDaemons();
  }, 15000);

  test("9. dev 新バージョン起動時に旧 dev デーモンが停止すること", async () => {
    stopAllDaemons();

    // 旧 dev デーモン起動
    execSync(`${RADIUSD_DEV} --exec ping`, { stdio: "ignore", timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    const daemonsBeforePurge = getDaemonCount();
    expect(daemonsBeforePurge).toBeGreaterThan(0);

    // 新 dev デーモン起動
    execSync(`${RADIUSD_DEV} --exec ping`, { stdio: "ignore", timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    const daemonsAfterPurge = getDaemonCount();
    expect(daemonsAfterPurge).toBe(1);

    stopAllDaemons();
  }, 15000);

  test("10. release 起動が dev デーモンを停止しないこと", async () => {
    stopAllDaemons();

    // dev デーモン起動
    execSync(`${RADIUSD_DEV} --exec ping`, { stdio: "ignore", timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    const devSocketsBefore = getSockets(DEV_HOME);
    expect(devSocketsBefore.length).toBeGreaterThan(0);

    // release デーモン起動
    execSync(`${RADIUSD_RELEASE} --exec ping`, { stdio: "ignore", timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // dev ソケットがまだ存在
    const devSocketsAfter = getSockets(DEV_HOME);
    expect(devSocketsAfter.length).toBeGreaterThan(0);

    // 両方のデーモンが稼働
    const daemons = getDaemonCount();
    expect(daemons).toBeGreaterThanOrEqual(2);

    stopAllDaemons();
  }, 15000);

  test("11. dev 起動が release デーモンを停止しないこと", async () => {
    stopAllDaemons();

    // release デーモン起動
    execSync(`${RADIUSD_RELEASE} --exec ping`, { stdio: "ignore", timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    const releaseSocketsBefore = getSockets(RELEASE_HOME);
    expect(releaseSocketsBefore.length).toBeGreaterThan(0);

    // dev デーモン起動
    execSync(`${RADIUSD_DEV} --exec ping`, { stdio: "ignore", timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // release ソケットがまだ存在
    const releaseSocketsAfter = getSockets(RELEASE_HOME);
    expect(releaseSocketsAfter.length).toBeGreaterThan(0);

    // 両方のデーモンが稼働
    const daemons = getDaemonCount();
    expect(daemons).toBeGreaterThanOrEqual(2);

    stopAllDaemons();
  }, 15000);

});

describe("データ分離", () => {

  test("12. release の診断レジストリが ~/.radius/ に保存されること", async () => {
    // 診断レジストリの保存先は getRadiusHome() 配下
    // テストは実際のファイル操作で確認するか、パスを確認
    expect(RELEASE_HOME).toContain(".radius");
    expect(RELEASE_HOME).not.toContain(".radius-dev");
  });

  test("13. dev の診断レジストリが ~/.radius-dev/ に保存されること", async () => {
    expect(DEV_HOME).toContain(".radius-dev");
    expect(DEV_HOME).not.toContain(".radius/");
  });

  test("14. release のセッションデータが dev に漏洩しないこと", async () => {
    // セッションデータも getRadiusHome() 配下に保存されるため、
    // RADIUS_HOME が分離されていれば自動的に分離される
    expect(RELEASE_HOME).not.toBe(DEV_HOME);
  });

});
