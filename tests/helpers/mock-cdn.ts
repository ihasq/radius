/**
 * Mock CDN server for auto-update E2E tests.
 */

export interface MockCdnOptions {
  latestJson: string;
  pubJson: string;
  binaries: Record<string, { gz: Buffer; sig: Buffer }>;
}

export interface MockCdnServer {
  url: string;
  stop: () => void;
  getRequestLog: () => string[];
  clearLog: () => void;
}

/**
 * Start a mock CDN server for testing auto-update functionality.
 */
export async function startMockCdn(options: MockCdnOptions): Promise<MockCdnServer> {
  const requestLog: string[] = [];

  const server = Bun.serve({
    port: 0, // Random available port
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      requestLog.push(`${req.method} ${path}`);

      // Serve latest.json
      if (path === "/latest.json") {
        return new Response(options.latestJson, {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Serve public key
      if (path === "/pub.json") {
        return new Response(options.pubJson, {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Serve binaries
      for (const [platform, binary] of Object.entries(options.binaries)) {
        if (path === `/${platform}.gz`) {
          return new Response(binary.gz, {
            headers: { "Content-Type": "application/gzip" },
          });
        }
        if (path === `/${platform}.gz.sig`) {
          return new Response(binary.sig, {
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  return {
    url: `http://localhost:${server.port}`,
    stop: () => server.stop(),
    getRequestLog: () => [...requestLog],
    clearLog: () => {
      requestLog.length = 0;
    },
  };
}

/**
 * Create a signed binary for testing.
 */
export async function createSignedBinary(
  content: Buffer,
  privateKeyJwk: JsonWebKey
): Promise<{ gz: Buffer; sig: Buffer; sha256: string }> {
  const { gzipSync } = await import("node:zlib");
  const { createHash } = await import("node:crypto");

  const gz = gzipSync(content);
  const sha256 = createHash("sha256").update(gz).digest("hex");

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "Ed25519" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign({ name: "Ed25519" }, privateKey, gz);

  return {
    gz: Buffer.from(gz),
    sig: Buffer.from(signature),
    sha256,
  };
}
