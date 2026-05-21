/**
 * RadlsProvider インタフェース
 *
 * 全言語の Language Server Provider が実装すべき共通インタフェース。
 * depth レベルに応じたメソッドを提供する。
 */

import type { RadSymbol } from "./index";

/**
 * テキスト編集 (フォーマット用)
 */
export interface TextEdit {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newText: string;
}

/**
 * ホバー情報
 */
export interface HoverResult {
  content: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * 参照情報
 */
export interface Reference {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * ファイル編集 (リネーム用)
 */
export interface FileEdit {
  filePath: string;
  edits: TextEdit[];
}

/**
 * 診断情報
 */
export interface Diagnostic {
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  code?: string | number;
}

/**
 * コード修正
 */
export interface CodeFix {
  title: string;
  edits: TextEdit[];
}

/**
 * RadlsProvider - 全言語共通の Language Service インタフェース
 */
export interface RadlsProvider {
  /**
   * depth-1: ファイルからシンボル一覧を取得
   */
  getSymbols(filePath: string, content: string): Promise<RadSymbol[]>;

  /**
   * depth-2: ファイルをフォーマット
   */
  format(filePath: string, content: string): Promise<TextEdit[]>;

  /**
   * depth-2: 指定位置のホバー情報を取得
   */
  getHoverInfo(filePath: string, line: number, col: number): Promise<HoverResult | null>;

  /**
   * depth-3: 指定位置のシンボルの参照を検索
   */
  findReferences(filePath: string, line: number, col: number): Promise<Reference[]>;

  /**
   * depth-3: シンボルをリネーム
   */
  rename(filePath: string, line: number, col: number, newName: string): Promise<FileEdit[]>;

  /**
   * depth-3: ファイルの診断情報を取得
   */
  getDiagnostics(filePath: string, content: string): Promise<Diagnostic[]>;

  /**
   * depth-4: 診断に対するコード修正を取得
   */
  getCodeFixes(filePath: string, diagnostic: Diagnostic): Promise<CodeFix[]>;

  /**
   * リソースのクリーンアップ
   */
  dispose(): Promise<void>;
}
