/**
 * Open VSX レジストリからの拡張ダウンロード。
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Open VSX レジストリURL（将来的にカスタムレジストリ対応可能） */
const OPENVSX_REGISTRY_URL = "https://open-vsx.org";

/** Open VSX API レスポンス */
export interface OpenVsxMetadata {
  namespace: string;
  name: string;
  version: string;
  files: {
    download: string;
  };
}

/**
 * Open VSXレジストリから拡張のメタデータを取得する。
 * @param extensionId "namespace.name" 形式
 * @returns メタデータ。見つからない場合はnull。
 */
export async function fetchExtensionMetadata(
  extensionId: string
): Promise<OpenVsxMetadata | null> {
  const [namespace, name] = extensionId.split(".");
  if (!namespace || !name) {
    throw new Error(`Invalid extension ID format: ${extensionId}`);
  }

  const url = `${OPENVSX_REGISTRY_URL}/api/${namespace}/${name}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data as OpenVsxMetadata;
  } catch (err) {
    if (err instanceof Error && err.message.includes("fetch failed")) {
      throw new Error(`Network error: cannot reach ${OPENVSX_REGISTRY_URL}`);
    }
    throw err;
  }
}

/**
 * Open VSXレジストリから.vsixをダウンロードし、一時ファイルに保存する。
 * @param downloadUrl メタデータから取得したダウンロードURL
 * @returns 一時ファイルのパス
 */
export async function downloadVsix(downloadUrl: string): Promise<string> {
  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const tempPath = join(tmpdir(), `radius-ext-${Date.now()}.vsix`);
    writeFileSync(tempPath, new Uint8Array(buffer));

    return tempPath;
  } catch (err) {
    if (err instanceof Error && err.message.includes("fetch failed")) {
      throw new Error(`Network error: cannot download extension`);
    }
    throw err;
  }
}

/**
 * Open VSXレジストリから拡張をダウンロードしてインストールする。
 * @param extensionId "namespace.name" 形式
 * @param registry ExtensionRegistryインスタンス
 * @returns インストールされた拡張のメタデータ
 */
export async function downloadAndInstall(
  extensionId: string,
  registry: any
): Promise<any> {
  // メタデータ取得
  const metadata = await fetchExtensionMetadata(extensionId);
  if (!metadata) {
    throw new Error(`extension not found on open-vsx.org: ${extensionId}`);
  }

  console.log(
    `downloading: ${extensionId} v${metadata.version} from open-vsx.org...`
  );

  // .vsixダウンロード
  const vsixPath = await downloadVsix(metadata.files.download);

  try {
    // インストール
    const extension = await registry.install(vsixPath);
    return extension;
  } finally {
    // 一時ファイル削除
    try {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(vsixPath);
    } catch {
      // 削除失敗は無視
    }
  }
}
