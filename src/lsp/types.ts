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

// Phase 17: Code Actions / Format

export interface LspCodeAction {
  title: string;
  kind?: string; // "quickfix", "refactor", "source.organizeImports" etc.
  diagnostics?: LspDiagnostic[];
  edit?: LspWorkspaceEdit;
  command?: { title: string; command: string; arguments?: unknown[] };
}

export interface LspFormattingOptions {
  tabSize: number;
  insertSpaces: boolean;
}

// Phase 18: LLM可読ビュー

export interface LspHover {
  contents: LspMarkupContent | string | Array<LspMarkupContent | string>;
  range?: LspRange;
}

export interface LspMarkupContent {
  kind: "plaintext" | "markdown";
  value: string;
}

export interface LspTypeHierarchyItem {
  name: string;
  kind: number; // SymbolKind
  uri: string;
  range: LspRange;
  selectionRange: LspRange;
}

export interface LspCodeLens {
  range: LspRange;
  command?: {
    title: string;
    command: string;
    arguments?: unknown[];
  };
  data?: unknown;
}

// Phase 19: Semantic Tokens

export interface LspSemanticTokens {
  data: number[]; // 5要素ずつのフラット配列
}

// SymbolKind の拡張
export const SymbolKindNames: Record<number, string> = {
  1: "File",
  2: "Module",
  3: "Namespace",
  4: "Package",
  5: "Class",
  6: "Method",
  7: "Property",
  8: "Field",
  9: "Constructor",
  10: "Enum",
  11: "Interface",
  12: "Function",
  13: "Variable",
  14: "Constant",
  15: "String",
  16: "Number",
  17: "Boolean",
  18: "Array",
  19: "Object",
  20: "Key",
  21: "Null",
  22: "EnumMember",
  23: "Struct",
  24: "Event",
  25: "Operator",
  26: "TypeParameter",
};

// Semantic Token Types
export const SemanticTokenTypes = [
  "namespace", "type", "class", "enum", "interface", "struct",
  "typeParameter", "parameter", "variable", "property", "enumMember",
  "event", "function", "method", "macro", "keyword", "modifier",
  "comment", "string", "number", "regexp", "operator", "decorator"
];

// Semantic Token Modifiers
export const SemanticTokenModifiers = [
  "declaration", "definition", "readonly", "static", "deprecated",
  "abstract", "async", "modification", "documentation", "defaultLibrary"
];
