/**
 * Upload signed release assets to the latest GitHub Release.
 *
 * Usage:
 *   GH_TOKEN=ghp_... bun run scripts/upload-release-assets.ts \
 *     --assets-dir release-assets \
 *     --tag v0.1.0+20260527134508
 *
 * If --tag is omitted, resolves the latest release tag via the GitHub API.
 */

import { readdirSync, readFileSync, createReadStream } from "node:fs";
import { join } from "node:path";

const REPO = process.env.GITHUB_REPO ?? "ihasq/radius";

async function resolveLatestTag(token: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(`latest release lookup failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { tag_name: string };
  return data.tag_name;
}

async function getReleaseId(token: string, tag: string): Promise<number> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(`release lookup failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id: number };
  return data.id;
}

async function deleteAsset(token: string, assetId: number): Promise<void> {
  await fetch(`https://api.github.com/repos/${REPO}/releases/assets/${assetId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
}

async function listAssets(token: string, releaseId: number): Promise<Array<{ id: number; name: string }>> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/${releaseId}/assets`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(`asset list failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<Array<{ id: number; name: string }>>;
}

async function uploadAsset(token: string, releaseId: number, filePath: string, name: string): Promise<void> {
  const data = readFileSync(filePath);
  const res = await fetch(
    `https://uploads.github.com/repos/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/octet-stream",
      },
      body: data,
    }
  );
  if (!res.ok) {
    throw new Error(`upload ${name} failed: ${res.status} ${await res.text()}`);
  }
  console.log(`uploaded ${name}`);
}

async function main(): Promise<void> {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GH_TOKEN or GITHUB_TOKEN is required");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  let assetsDir = "";
  let tag = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--assets-dir") assetsDir = args[++i] ?? "";
    else if (args[i] === "--tag") tag = args[++i] ?? "";
  }

  if (!assetsDir) {
    console.error("usage: upload-release-assets.ts --assets-dir DIR [--tag TAG]");
    process.exit(1);
  }

  if (!tag) {
    tag = await resolveLatestTag(token);
  }

  const releaseId = await getReleaseId(token, tag);
  const existing = await listAssets(token, releaseId);
  const files = readdirSync(assetsDir).filter(
    (name) =>
      name === "latest.json" ||
      name === "pub.json" ||
      name.endsWith(".gz") ||
      name.endsWith(".gz.sig")
  );

  for (const file of files) {
    const prior = existing.find((asset) => asset.name === file);
    if (prior) {
      await deleteAsset(token, prior.id);
    }
    await uploadAsset(token, releaseId, join(assetsDir, file), file);
  }

  console.log(`attached ${files.length} assets to ${tag}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
