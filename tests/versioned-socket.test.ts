/**
 * バージョン分離テスト
 *
 * RADIUS_RELEASE_HASH によるソケット/PIDファイルのバージョン分離と
 * 旧バージョンファイルのクリーンアップをテストする。
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { existsSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setupTestRadiusHome, cleanupTestRadiusHome } from "./helpers/test-isolation";
import { radius } from "./helpers/radius";
import { getSocketPath, getPidPath, getRadiusHome } from "../src/shared/paths";
import { stopDaemon } from "./helpers/daemon";

/**
 * 環境変数を一時的に設定して関数を実行するヘルパー
 */
function withReleaseHash<T>(hash: string | undefined, fn: () => T): T {
  const prev = process.env.RADIUS_RELEASE_HASH;
  if (hash !== undefined) {
    process.env.RADIUS_RELEASE_HASH = hash;
  } else {
    delete process.env.RADIUS_RELEASE_HASH;
  }
  try {
    return fn();
  } finally {
    if (prev !== undefined) {
      process.env.RADIUS_RELEASE_HASH = prev;
    } else {
      delete process.env.RADIUS_RELEASE_HASH;
    }
  }
}

/**
 * 特定のハッシュを持つデーモンを停止するヘルパー
 */
async function stopDaemonWithHash(hash: string | undefined): Promise<void> {
  await withReleaseHash(hash, async () => {
    await stopDaemon();
  });
}

/**
 * 全てのバージョン付きデーモンを停止するヘルパー
 */
async function stopAllDaemons(): Promise<void> {
  const radiusHome = getRadiusHome();
  if (!existsSync(radiusHome)) return;

  const files = readdirSync(radiusHome);
  for (const file of files) {
    if (file.startsWith("daemon-") && file.endsWith(".sock")) {
      // daemon-{hash}.sock からハッシュを抽出
      const hash = file.slice(7, -5); // "daemon-" = 7, ".sock" = 5
      await stopDaemonWithHash(hash);
    } else if (file === "daemon.sock") {
      await stopDaemonWithHash(undefined);
    }
  }
  await Bun.sleep(500);
}

describe("versioned socket paths", () => {
  beforeAll(() => {
    setupTestRadiusHome("versioned-socket");
  });

  afterAll(async () => {
    // 全デーモンを停止
    await stopDaemon();
    cleanupTestRadiusHome();
  });

  describe("path resolution", () => {
    test("getSocketPath returns versioned path when RADIUS_RELEASE_HASH is set", () => {
      const result = withReleaseHash("abc123", () => getSocketPath());
      expect(result).toContain("daemon-abc123.sock");
    });

    test("getSocketPath returns default path when RADIUS_RELEASE_HASH is unset", () => {
      const result = withReleaseHash(undefined, () => getSocketPath());
      expect(result).toContain("daemon.sock");
      expect(result).not.toContain("daemon-");
    });

    test("getPidPath returns versioned path when RADIUS_RELEASE_HASH is set", () => {
      const result = withReleaseHash("abc123", () => getPidPath());
      expect(result).toContain("daemon-abc123.pid");
    });

    test("getPidPath returns default path when RADIUS_RELEASE_HASH is unset", () => {
      const result = withReleaseHash(undefined, () => getPidPath());
      expect(result).toContain("daemon.pid");
      expect(result).not.toContain("daemon-");
    });
  });

  describe("daemon isolation", () => {
    afterEach(async () => {
      // 全バージョンのデーモンを停止
      await stopAllDaemons();
    });

    test("daemon uses versioned socket file", async () => {
      const radiusHome = getRadiusHome();

      // RADIUS_RELEASE_HASH=testhash でデーモンを起動
      const result = await radius(["ping"], {
        env: { RADIUS_RELEASE_HASH: "testhash" },
      });

      expect(result.stdout).toContain("pong");

      // daemon-testhash.sock が存在すること
      expect(existsSync(join(radiusHome, "daemon-testhash.sock"))).toBe(true);

      // daemon.sock は存在しないこと
      expect(existsSync(join(radiusHome, "daemon.sock"))).toBe(false);
    }, 30_000);

    test("CLI connects to versioned socket", async () => {
      // RADIUS_RELEASE_HASH=testhash で ping
      const result = await radius(["ping"], {
        env: { RADIUS_RELEASE_HASH: "testhash" },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("pong");
    }, 30_000);

    test("different RADIUS_RELEASE_HASH creates separate daemon", async () => {
      const radiusHome = getRadiusHome();

      // hash-v1 でデーモン起動
      const result1 = await radius(["ping"], {
        env: { RADIUS_RELEASE_HASH: "hash-v1" },
      });
      expect(result1.stdout).toContain("pong");

      // hash-v2 で別デーモン起動
      const result2 = await radius(["ping"], {
        env: { RADIUS_RELEASE_HASH: "hash-v2" },
      });
      expect(result2.stdout).toContain("pong");

      // 両方のソケットが存在すること
      expect(existsSync(join(radiusHome, "daemon-hash-v1.sock"))).toBe(true);
      expect(existsSync(join(radiusHome, "daemon-hash-v2.sock"))).toBe(true);
    }, 30_000);

    test("dev mode without hash uses daemon.sock", async () => {
      const radiusHome = getRadiusHome();

      // RADIUS_RELEASE_HASH を未設定で ping
      const result = await radius(["ping"], {
        env: { RADIUS_RELEASE_HASH: "" },  // 明示的に空文字で未設定扱い
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("pong");

      // daemon.sock が存在すること
      expect(existsSync(join(radiusHome, "daemon.sock"))).toBe(true);
    }, 30_000);
  });

  describe("old version cleanup", () => {
    beforeEach(async () => {
      // 各テスト前に全デーモンを停止してクリーンな状態にする
      await stopAllDaemons();
    });

    afterEach(async () => {
      // 全バージョンのデーモンを停止
      await stopAllDaemons();
    });

    test("stale socket files from other versions are removed on startup", async () => {
      const radiusHome = getRadiusHome();
      mkdirSync(radiusHome, { recursive: true });

      // ダミーの古いソケットファイルを作成
      writeFileSync(join(radiusHome, "daemon-old1.sock"), "");
      writeFileSync(join(radiusHome, "daemon-old2.sock"), "");

      // RADIUS_RELEASE_HASH=current でデーモンを起動
      const result = await radius(["ping"], {
        env: { RADIUS_RELEASE_HASH: "current" },
      });
      expect(result.stdout).toContain("pong");

      // 古いソケットが削除されていること
      expect(existsSync(join(radiusHome, "daemon-old1.sock"))).toBe(false);
      expect(existsSync(join(radiusHome, "daemon-old2.sock"))).toBe(false);

      // 現在のソケットは存在すること
      expect(existsSync(join(radiusHome, "daemon-current.sock"))).toBe(true);
    }, 30_000);

    test("stale PID files from other versions are removed on startup", async () => {
      const radiusHome = getRadiusHome();
      mkdirSync(radiusHome, { recursive: true });

      // ダミーの古いPIDファイルを作成
      writeFileSync(join(radiusHome, "daemon-old1.pid"), "99999");

      // RADIUS_RELEASE_HASH=current でデーモンを起動
      const result = await radius(["ping"], {
        env: { RADIUS_RELEASE_HASH: "current" },
      });
      expect(result.stdout).toContain("pong");

      // 古いPIDが削除されていること
      expect(existsSync(join(radiusHome, "daemon-old1.pid"))).toBe(false);

      // 現在のPIDは存在すること
      expect(existsSync(join(radiusHome, "daemon-current.pid"))).toBe(true);
    }, 30_000);

    test("cleanup does not remove current version socket", async () => {
      const radiusHome = getRadiusHome();

      // RADIUS_RELEASE_HASH=current でデーモン起動
      let result = await radius(["ping"], {
        env: { RADIUS_RELEASE_HASH: "current" },
      });
      expect(result.stdout).toContain("pong");
      expect(existsSync(join(radiusHome, "daemon-current.sock"))).toBe(true);

      // デーモン停止
      await radius(["daemon", "stop"], {
        env: { RADIUS_RELEASE_HASH: "current" },
      });
      await Bun.sleep(500);

      // 再起動
      result = await radius(["ping"], {
        env: { RADIUS_RELEASE_HASH: "current" },
      });
      expect(result.stdout).toContain("pong");

      // ソケットが存在し続けること
      expect(existsSync(join(radiusHome, "daemon-current.sock"))).toBe(true);
    }, 30_000);

    test("cleanup does not affect non-daemon files", async () => {
      const radiusHome = getRadiusHome();
      mkdirSync(radiusHome, { recursive: true });

      // 非デーモンファイルを作成
      writeFileSync(join(radiusHome, "session.json"), "{}");
      writeFileSync(join(radiusHome, "ledger.json"), "[]");

      // RADIUS_RELEASE_HASH=current でデーモンを起動
      const result = await radius(["ping"], {
        env: { RADIUS_RELEASE_HASH: "current" },
      });
      expect(result.stdout).toContain("pong");

      // 非デーモンファイルが削除されていないこと
      expect(existsSync(join(radiusHome, "session.json"))).toBe(true);
      expect(existsSync(join(radiusHome, "ledger.json"))).toBe(true);
    }, 30_000);
  });
});
