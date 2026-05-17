/**
 * Extension registry。
 *
 * ~/.radius/extensions/ 配下に拡張を管理する。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, basename, extname } from "node:path";
import { homedir } from "node:os";
import AdmZip from "adm-zip";
import { scanExtension } from "./scanner";
import type { ResolvedExtension, SerializedExtension } from "./types";

/**
 * 拡張のインストール先ディレクトリ。
 */
function getExtensionsDir(): string {
  return join(homedir(), ".radius", "extensions");
}

/**
 * レジストリファイルのパス。
 */
function getRegistryPath(): string {
  return join(getExtensionsDir(), "registry.json");
}

/**
 * ResolvedExtension を SerializedExtension に変換。
 */
function serialize(ext: ResolvedExtension): SerializedExtension {
  const fileExtensionMap: Record<string, string> = {};
  for (const [key, value] of ext.fileExtensionMap) {
    fileExtensionMap[key] = value;
  }
  return {
    id: ext.id,
    manifest: ext.manifest,
    extensionPath: ext.extensionPath,
    entryPoint: ext.entryPoint,
    fileExtensionMap,
  };
}

/**
 * SerializedExtension を ResolvedExtension に変換。
 */
function deserialize(serialized: SerializedExtension): ResolvedExtension {
  const fileExtensionMap = new Map<string, string>(
    Object.entries(serialized.fileExtensionMap)
  );
  return {
    id: serialized.id,
    manifest: serialized.manifest,
    extensionPath: serialized.extensionPath,
    entryPoint: serialized.entryPoint,
    fileExtensionMap,
  };
}

/**
 * 拡張レジストリ。
 */
export class ExtensionRegistry {
  private extensions: Map<string, ResolvedExtension> = new Map();

  constructor() {
    // ディレクトリが存在しない場合は作成
    const extensionsDir = getExtensionsDir();
    if (!existsSync(extensionsDir)) {
      mkdirSync(extensionsDir, { recursive: true });
    }

    // registry.json を読み込み
    this.load();
  }

  /**
   * registry.json から拡張一覧を読み込む。
   */
  private load(): void {
    const registryPath = getRegistryPath();
    if (!existsSync(registryPath)) {
      return;
    }

    try {
      const content = readFileSync(registryPath, "utf-8");
      const serialized: SerializedExtension[] = JSON.parse(content);
      for (const item of serialized) {
        const ext = deserialize(item);
        this.extensions.set(ext.id, ext);
      }
    } catch (err) {
      console.warn(`[registry] Failed to load registry.json: ${err}`);
    }
  }

  /**
   * 現在の拡張一覧を registry.json に保存する。
   */
  private save(): void {
    const registryPath = getRegistryPath();
    const serialized = Array.from(this.extensions.values()).map(serialize);
    try {
      writeFileSync(registryPath, JSON.stringify(serialized, null, 2), "utf-8");
    } catch (err) {
      console.error(`[registry] Failed to save registry.json: ${err}`);
    }
  }

  /**
   * .vsix (zip) またはディレクトリから拡張をインストールする。
   *
   * @param source .vsix ファイルパスまたは拡張ディレクトリパス
   * @returns インストールされた ResolvedExtension
   */
  async install(source: string): Promise<ResolvedExtension> {
    const sourcePath = resolve(source);

    if (!existsSync(sourcePath)) {
      throw new Error(`Source not found: ${sourcePath}`);
    }

    let extensionDir: string;

    // .vsix ファイルの場合
    if (extname(sourcePath) === ".vsix") {
      extensionDir = await this.extractVsix(sourcePath);
    } else {
      // ディレクトリの場合
      extensionDir = sourcePath;
    }

    // スキャンして ResolvedExtension を取得
    const ext = scanExtension(extensionDir);
    if (!ext) {
      throw new Error(`Failed to scan extension: ${extensionDir}`);
    }

    // .vsix から展開した場合、最終的な配置先にコピー
    if (extname(sourcePath) === ".vsix") {
      const targetDir = join(getExtensionsDir(), ext.id);
      // 既存ディレクトリを削除
      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true });
      }
      // コピー（extensionDir は一時展開先なので移動）
      const fs = await import("node:fs");
      fs.renameSync(extensionDir, targetDir);
      ext.extensionPath = targetDir;
      // entryPoint も更新（相対パスを維持）
      if (ext.entryPoint) {
        const relativePath = ext.entryPoint.substring(extensionDir.length + 1);
        ext.entryPoint = join(targetDir, relativePath);
      }
    }

    // 既存の拡張を上書き
    this.extensions.set(ext.id, ext);
    this.save();

    return ext;
  }

  /**
   * .vsix ファイルを展開する。
   *
   * @param vsixPath .vsix ファイルの絶対パス
   * @returns 展開されたディレクトリパス（extension/ ディレクトリ）
   */
  private async extractVsix(vsixPath: string): Promise<string> {
    const zip = new AdmZip(vsixPath);
    const tmpDir = join(getExtensionsDir(), `.tmp-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    // ZIP 内の extension/ ディレクトリを抽出
    zip.extractAllTo(tmpDir, true);

    const extensionDir = join(tmpDir, "extension");
    if (!existsSync(extensionDir)) {
      // extension/ ディレクトリが存在しない場合は tmpDir 自体を返す
      return tmpDir;
    }

    return extensionDir;
  }

  /**
   * インストール済み拡張の一覧を返す。
   */
  list(): ResolvedExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * 拡張をアンインストールする。
   *
   * @param extensionId publisher.name 形式のID
   * @returns 成功時 true、拡張が存在しない場合 false
   */
  async remove(extensionId: string): Promise<boolean> {
    const ext = this.extensions.get(extensionId);
    if (!ext) {
      return false;
    }

    // ディレクトリ削除: ~/.radius/extensions/ 配下にある場合のみ
    const extensionsDir = getExtensionsDir();
    const isInExtensionsDir = ext.extensionPath.startsWith(extensionsDir);

    if (isInExtensionsDir) {
      try {
        rmSync(ext.extensionPath, { recursive: true, force: true });
      } catch (err) {
        console.warn(`[registry] Failed to remove directory: ${ext.extensionPath}`);
      }
    }
    // ディレクトリインストールの場合はファイル削除をスキップ

    // レジストリから削除
    this.extensions.delete(extensionId);
    this.save();

    return true;
  }

  /**
   * ファイル拡張子から対応する拡張を検索する。
   *
   * @param ext ファイル拡張子（例: ".ts"）
   * @returns 対応する ResolvedExtension、見つからない場合 null
   */
  findByFileExtension(ext: string): ResolvedExtension | null {
    for (const resolvedExt of this.extensions.values()) {
      if (resolvedExt.fileExtensionMap.has(ext)) {
        return resolvedExt;
      }
    }
    return null;
  }

  /**
   * 拡張IDから拡張を取得する。
   */
  get(extensionId: string): ResolvedExtension | undefined {
    return this.extensions.get(extensionId);
  }
}
