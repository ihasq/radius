/**
 * LSPプロトコルの型定義（Radiusが使用するサブセット）。
 */

export interface LspPosition {
  line: number;       // 0-indexed
  character: number;  // 0-indexed
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

export interface LspDocumentSymbol {
  name: string;
  kind: number;
  range: LspRange;
  selectionRange: LspRange;
  children?: LspDocumentSymbol[];
}

/** LSPのSymbolKind定数（使用するもののみ）。 */
export const SymbolKind = {
  Variable: 13,
  Constant: 14,
  Parameter: 25, // non-standard, some servers use this
} as const;

/** textDocument/rename用の型定義 */
export interface LspTextEdit {
  range: LspRange;
  newText: string;
}

export interface LspWorkspaceEdit {
  changes?: Record<string, LspTextEdit[]>;
  documentChanges?: LspTextDocumentEdit[];
}

export interface LspTextDocumentEdit {
  textDocument: { uri: string; version: number | null };
  edits: LspTextEdit[];
}

/** Call Hierarchy 用の型定義 */
export interface LspCallHierarchyItem {
  name: string;
  kind: number;
  uri: string;
  range: LspRange;
  selectionRange: LspRange;
}

export interface LspCallHierarchyIncomingCall {
  from: LspCallHierarchyItem;
  fromRanges: LspRange[];
}

export interface LspCallHierarchyOutgoingCall {
  to: LspCallHierarchyItem;
  fromRanges: LspRange[];
}

/** textDocument/publishDiagnostics用の型定義 */
export interface LspDiagnostic {
  range: LspRange;
  severity?: number; // 1: Error, 2: Warning, 3: Information, 4: Hint
  code?: string | number;
  source?: string;
  message: string;
}

export const DiagnosticSeverity = {
  Error: 1,
  Warning: 2,
  Information: 3,
  Hint: 4,
} as const;
