/**
 * host.ts - TypeScript LanguageServiceHost factory
 *
 * depth-2: 対象ファイル + 直接importのみを含むホストを作成
 * depth-3: プロジェクト全体のファイルを含むホストを作成
 */

import ts from "typescript";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { getDirectImports } from "./depth";
import { TsRad } from "./index";
import { appendFileSync } from "node:fs";

/** depth-3: プロジェクト内のファイル数上限（node_modules hell 回避） */
const MAX_PROJECT_FILES = 200;

/**
 * depth-2 用の LanguageServiceHost を作成する。
 * 対象ファイルと直接 import されているファイルのみを含む。
 *
 * @param filePath 解析対象ファイルの絶対パス
 * @param content ファイル内容
 * @param projectRoot プロジェクトルート
 * @returns LanguageServiceHost
 */
export function createDepth2Host(
  filePath: string,
  content: string,
  projectRoot: string
): { host: ts.LanguageServiceHost; updateFile: (fileName: string, content: string) => void } {
  const tsRad = new TsRad();
  const sourceFile = tsRad.parseFile(filePath, content);

  // 直接 import されているファイルを取得
  const directImports = getDirectImports(sourceFile, filePath, projectRoot);

  // ファイルリスト: 対象ファイル + 直接import
  const files = [filePath, ...directImports];

  // ファイル内容のキャッシュ
  const fileCache = new Map<string, string>();
  fileCache.set(filePath, content);

  // ファイルバージョン管理（mtime ではなくインクリメンタルカウンタ）
  const versionMap = new Map<string, number>();
  versionMap.set(filePath, 1);

  // tsconfig.json を読み込む
  const compilerOptions = loadCompilerOptions(projectRoot);

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => files,

    getScriptVersion: (fileName: string) => {
      return (versionMap.get(fileName) || 0).toString();
    },

    getScriptSnapshot: (fileName: string) => {
      // キャッシュから取得
      if (fileCache.has(fileName)) {
        return ts.ScriptSnapshot.fromString(fileCache.get(fileName)!);
      }

      // ファイルを読み込み
      if (existsSync(fileName)) {
        try {
          const text = readFileSync(fileName, "utf-8");
          fileCache.set(fileName, text);
          return ts.ScriptSnapshot.fromString(text);
        } catch {
          return undefined;
        }
      }

      return undefined;
    },

    getCurrentDirectory: () => projectRoot,

    getCompilationSettings: () => compilerOptions,

    getDefaultLibFileName: (options: ts.CompilerOptions) => ts.getDefaultLibFilePath(options),

    fileExists: (fileName: string) => existsSync(fileName),

    readFile: (fileName: string) => {
      try {
        return readFileSync(fileName, "utf-8");
      } catch {
        return undefined;
      }
    },

    resolveModuleNames: undefined, // depth-2 では node_modules の解決を行わない
  } as any;

  // ポーリング無効化（型定義外のプロパティ）
  (host as any).watchFile = () => ({ close() {} });
  (host as any).watchDirectory = () => ({ close() {} });

  // ファイル更新通知（キャッシュ更新 + バージョン加算）
  function updateFile(fileName: string, content: string): void {
    const oldVersion = versionMap.get(fileName) || 0;
    const newVersion = oldVersion + 1;
    fileCache.set(fileName, content);
    versionMap.set(fileName, newVersion);
    console.log(`[TsRadHost] updateFile: ${fileName} v${oldVersion} -> v${newVersion}`);
  }

  return { host, updateFile };
}

/**
 * tsconfig.json を読み込んで CompilerOptions を返す。
 */
function loadCompilerOptions(projectRoot: string): ts.CompilerOptions {
  const tsconfigPath = join(projectRoot, "tsconfig.json");

  if (!existsSync(tsconfigPath)) {
    // デフォルト設定
    return {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      lib: ["lib.es2020.d.ts"],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      moduleResolution: ts.ModuleResolutionKind.Node10,
    };
  }

  try {
    const configText = readFileSync(tsconfigPath, "utf-8");
    const parseResult = ts.parseConfigFileTextToJson(tsconfigPath, configText);

    if (parseResult.error) {
      return getDefaultOptions();
    }

    const configObject = parseResult.config;

    // カスタム sys オブジェクト（ポーリング回避）
    const customSys = {
      ...ts.sys,
      watchFile: undefined,
      watchDirectory: undefined,
    };

    const parsedConfig = ts.parseJsonConfigFileContent(
      configObject,
      customSys as any,
      projectRoot
    );

    return parsedConfig.options;
  } catch {
    return getDefaultOptions();
  }
}

/**
 * デフォルトの CompilerOptions を返す。
 */
function getDefaultOptions(): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    lib: ["lib.es2020.d.ts"],
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.Node10,
  };
}

/**
 * depth-3 用の LanguageServiceHost を作成する。
 * プロジェクト全体のファイルを含む（tsconfig.json の include/exclude に従う）。
 *
 * @param projectRoot プロジェクトルート
 * @param targetFile 操作対象ファイル（truncate 時に優先的に保持）
 * @returns LanguageServiceHost と対象ファイル一覧
 */
export function createDepth3Host(
  projectRoot: string,
  targetFile?: string
): { host: ts.LanguageServiceHost; fileNames: string[]; updateFile: (fileName: string, content: string) => void } {
  const tsconfigPath = join(projectRoot, "tsconfig.json");

  // プロジェクト内のファイル一覧を取得
  let fileNames = resolveProjectFiles(projectRoot, tsconfigPath);

  // 安全弁: ファイル数上限
  if (fileNames.length > MAX_PROJECT_FILES) {
    try {
      appendFileSync("/tmp/tsrad-debug.log", `[depth3] WARNING: ${fileNames.length} files > ${MAX_PROJECT_FILES}, truncating\n`);
    } catch {}

    // 操作対象ファイルを先頭に移動してから truncate
    if (targetFile) {
      const idx = fileNames.indexOf(targetFile);
      if (idx > 0) {
        fileNames.splice(idx, 1);
        fileNames.unshift(targetFile);
      } else if (idx === -1) {
        // targetFile がリストになければ先頭に追加
        fileNames.unshift(targetFile);
      }
    }

    fileNames = fileNames.slice(0, MAX_PROJECT_FILES);
  }

  // デバッグログ: ファイル一覧を出力
  try {
    appendFileSync("/tmp/depth3-files.log", fileNames.join("\n") + "\n---\n");
  } catch {}

  // ファイル内容のキャッシュ
  const fileCache = new Map<string, string>();

  // ファイルバージョン管理（mtime ではなくインクリメンタルカウンタ）
  const versionMap = new Map<string, number>();

  // tsconfig.json を読み込む
  const compilerOptions = loadCompilerOptions(projectRoot);

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => fileNames,

    getScriptVersion: (fileName: string) => {
      return (versionMap.get(fileName) || 0).toString();
    },

    getScriptSnapshot: (fileName: string) => {
      // キャッシュから取得
      if (fileCache.has(fileName)) {
        return ts.ScriptSnapshot.fromString(fileCache.get(fileName)!);
      }

      // ファイルを読み込み
      if (existsSync(fileName)) {
        try {
          const text = readFileSync(fileName, "utf-8");
          fileCache.set(fileName, text);
          return ts.ScriptSnapshot.fromString(text);
        } catch {
          return undefined;
        }
      }

      return undefined;
    },

    getCurrentDirectory: () => projectRoot,

    getCompilationSettings: () => compilerOptions,

    getDefaultLibFileName: (options: ts.CompilerOptions) => ts.getDefaultLibFilePath(options),

    fileExists: (fileName: string) => existsSync(fileName),

    readFile: (fileName: string) => {
      try {
        return readFileSync(fileName, "utf-8");
      } catch {
        return undefined;
      }
    },

    resolveModuleNames: undefined, // depth-3 でも node_modules の深い解決は行わない
  } as any;

  // ポーリング無効化（型定義外のプロパティ）
  (host as any).watchFile = () => ({ close() {} });
  (host as any).watchDirectory = () => ({ close() {} });

  // ファイル更新通知（キャッシュ更新 + バージョン加算）
  function updateFile(fileName: string, content: string): void {
    const oldVersion = versionMap.get(fileName) || 0;
    const newVersion = oldVersion + 1;
    fileCache.set(fileName, content);
    versionMap.set(fileName, newVersion);
    console.log(`[TsRadHost] updateFile: ${fileName} v${oldVersion} -> v${newVersion}`);
  }

  return { host, fileNames, updateFile };
}

/**
 * tsconfig.json から対象ファイル一覧を解決する。
 * node_modules 内のファイルは除外する。
 */
function resolveProjectFiles(projectRoot: string, tsconfigPath: string): string[] {
  if (!existsSync(tsconfigPath)) {
    // tsconfig.json がない場合は空配列
    return [];
  }

  try {
    const configText = readFileSync(tsconfigPath, "utf-8");
    const configFile = ts.parseConfigFileTextToJson(tsconfigPath, configText);

    if (configFile.error) {
      return [];
    }

    // カスタム sys オブジェクト（ポーリング回避）
    const customSys = {
      ...ts.sys,
      watchFile: undefined,
      watchDirectory: undefined,
    };

    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      customSys as any,
      projectRoot
    );

    // parsed.fileNames は tsconfig の include/exclude を解決済み
    // node_modules は通常 exclude されているが、念のため明示的にフィルタ
    const filtered = parsedConfig.fileNames.filter(fileName => {
      return !fileName.includes("node_modules");
    });

    return filtered;
  } catch {
    return [];
  }
}
