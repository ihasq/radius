/**
 * ext コマンドハンドラ群。
 *
 * 拡張のインストール・一覧表示・削除を処理する。
 */

import type { ExtensionRegistry } from "../../extension-host/registry";
import type { ExtensionLoader } from "../../extension-host/loader";
import type { IpcResponse } from "../../shared/types";
import { downloadAndInstall } from "../../extension-host/openvsx";

/**
 * ext install コマンドハンドラ。
 */
export async function handleExtInstall(
  args: Record<string, unknown>,
  registry: ExtensionRegistry,
  loader: ExtensionLoader
): Promise<IpcResponse> {
  const source = args.source as string | undefined;

  if (!source) {
    return { ok: false, error: "Missing required arg: source" };
  }

  try {
    let ext;

    // ローカルパス判定: "/" または "." を含む場合
    const isLocalPath = source.includes("/") || source.includes(".");

    // ただし "namespace.name" 形式（"." は1つだけで "/" を含まない）の場合はレジストリID
    const isRegistryId = !source.includes("/") && source.split(".").length === 2;

    if (isRegistryId) {
      // Open VSX からダウンロード
      ext = await downloadAndInstall(source, registry);
    } else {
      // ローカルインストール
      ext = await registry.install(source);
    }

    // インストール後、即座に activate
    try {
      await loader.load(ext.id);
    } catch (err) {
      console.warn(`[ext-install] Failed to activate extension: ${err}`);
      if (err instanceof Error && err.stack) {
        console.warn("[ext-install] Stack trace:");
        console.warn(err.stack);
      }
      // インストール自体は成功しているので continue
    }

    // サマリを生成
    const languages: string[] = [];
    for (const [fileExt, langId] of ext.fileExtensionMap) {
      languages.push(`${langId} (${fileExt})`);
    }

    const summary = [
      `installed: ${ext.id} v${ext.manifest.version}`,
      languages.length > 0 ? `languages: ${languages.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return { ok: true, data: summary };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to install extension: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * ext list コマンドハンドラ。
 */
export async function handleExtList(
  args: Record<string, unknown>,
  registry: ExtensionRegistry
): Promise<IpcResponse> {
  const extensions = registry.list();

  if (extensions.length === 0) {
    return { ok: true, data: "no extensions installed" };
  }

  const lines = [`installed extensions: ${extensions.length}`, ""];

  for (const ext of extensions) {
    // languageId を重複なしで取得
    const languages = Array.from(new Set(ext.fileExtensionMap.values()));
    const langStr = languages.length > 0 ? ` [${languages.join(", ")}]` : "";
    lines.push(`  ${ext.id}  v${ext.manifest.version}${langStr}`);
  }

  return { ok: true, data: lines.join("\n") };
}

/**
 * ext remove コマンドハンドラ。
 */
export async function handleExtRemove(
  args: Record<string, unknown>,
  registry: ExtensionRegistry
): Promise<IpcResponse> {
  const extensionId = args.extensionId as string | undefined;

  if (!extensionId) {
    return { ok: false, error: "Missing required arg: extensionId" };
  }

  const removed = await registry.remove(extensionId);

  if (!removed) {
    return { ok: false, error: `Extension not found: ${extensionId}` };
  }

  const message = [
    `removed: ${extensionId}`,
    "note: restart daemon to fully unload (radius daemon stop)",
  ].join("\n");

  return { ok: true, data: message };
}
