/**
 * vscode モジュールシム。
 *
 * 拡張が require("vscode") した際に返されるオブジェクト。
 * 言語拡張が使用するAPIの最小サブセットを実装する。
 */

// ========================================
// 基本型定義
// ========================================

export class Uri {
  scheme: string;
  fsPath: string;
  path: string;

  constructor(scheme: string, _authority: string, path: string, _query: string, _fragment: string) {
    this.scheme = scheme;
    this.path = path;
    this.fsPath = scheme === "file" ? path : "";
  }

  static file(path: string): Uri {
    return new Uri("file", "", path, "", "");
  }

  static parse(value: string): Uri {
    // 簡易的なURL解析
    const url = new URL(value);
    return new Uri(url.protocol.replace(":", ""), url.hostname, url.pathname, url.search, url.hash);
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }

  toJSON() {
    return {
      scheme: this.scheme,
      path: this.path,
      fsPath: this.fsPath,
    };
  }
}

export class Position {
  line: number;
  character: number;

  constructor(line: number, character: number) {
    this.line = line;
    this.character = character;
  }
}

export class Range {
  start: Position;
  end: Position;

  constructor(start: Position, end: Position);
  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  constructor(
    startOrLine: Position | number,
    endOrCharacter: Position | number,
    endLine?: number,
    endCharacter?: number
  ) {
    if (typeof startOrLine === "number") {
      this.start = new Position(startOrLine, endOrCharacter as number);
      this.end = new Position(endLine!, endCharacter!);
    } else {
      this.start = startOrLine;
      this.end = endOrCharacter as Position;
    }
  }
}

export class Location {
  uri: Uri;
  range: Range;

  constructor(uri: Uri, rangeOrPosition: Range | Position) {
    this.uri = uri;
    this.range = rangeOrPosition instanceof Range
      ? rangeOrPosition
      : new Range(rangeOrPosition, rangeOrPosition);
  }
}

export class Diagnostic {
  range: Range;
  message: string;
  severity: DiagnosticSeverity;
  source?: string;
  code?: string | number;

  constructor(range: Range, message: string, severity?: DiagnosticSeverity) {
    this.range = range;
    this.message = message;
    this.severity = severity ?? DiagnosticSeverity.Error;
  }
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Disposable {
  private callOnDispose?: () => void;

  constructor(callOnDispose: () => void) {
    this.callOnDispose = callOnDispose;
  }

  dispose(): void {
    if (this.callOnDispose) {
      this.callOnDispose();
      this.callOnDispose = undefined;
    }
  }

  static from(...disposables: Disposable[]): Disposable {
    return new Disposable(() => {
      for (const d of disposables) {
        d.dispose();
      }
    });
  }
}

// ========================================
// イベント型定義
// ========================================

export interface Event<T> {
  (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
}

function createNoOpEvent<T>(): Event<T> {
  return () => new Disposable(() => {});
}

// ========================================
// workspace
// ========================================

export interface WorkspaceConfiguration {
  get<T>(section: string): T | undefined;
  get<T>(section: string, defaultValue: T): T;
  has(section: string): boolean;
  inspect<T>(section: string): { key: string; defaultValue?: T } | undefined;
  update(section: string, value: any): Promise<void>;
}

class DummyWorkspaceConfiguration implements WorkspaceConfiguration {
  get<T>(_section: string, defaultValue?: T): T | undefined {
    return defaultValue;
  }

  has(_section: string): boolean {
    return false;
  }

  inspect<T>(_section: string): { key: string; defaultValue?: T } | undefined {
    return undefined;
  }

  async update(_section: string, _value: any): Promise<void> {
    // no-op
  }
}

export interface WorkspaceFolder {
  uri: Uri;
  name: string;
  index: number;
}

export interface TextDocument {
  uri: Uri;
  fileName: string;
  languageId: string;
}

class WorkspaceImpl {
  workspaceFolders: WorkspaceFolder[] | undefined = undefined;
  onDidChangeConfiguration: Event<any> = createNoOpEvent();
  onDidOpenTextDocument: Event<TextDocument> = createNoOpEvent();
  onDidCloseTextDocument: Event<TextDocument> = createNoOpEvent();
  onDidChangeTextDocument: Event<any> = createNoOpEvent();
  onDidSaveTextDocument: Event<TextDocument> = createNoOpEvent();

  getConfiguration(_section?: string): WorkspaceConfiguration {
    return new DummyWorkspaceConfiguration();
  }

  createFileSystemWatcher(globPattern: string): FileSystemWatcher {
    return new FileSystemWatcherImpl(globPattern);
  }

  getWorkspaceFolder(_uri: Uri): WorkspaceFolder | undefined {
    return this.workspaceFolders?.[0];
  }
}

export interface FileSystemWatcher extends Disposable {
  onDidCreate: Event<Uri>;
  onDidChange: Event<Uri>;
  onDidDelete: Event<Uri>;
}

class FileSystemWatcherImpl extends Disposable implements FileSystemWatcher {
  onDidCreate: Event<Uri> = createNoOpEvent();
  onDidChange: Event<Uri> = createNoOpEvent();
  onDidDelete: Event<Uri> = createNoOpEvent();

  constructor(_globPattern: string) {
    super(() => {});
  }
}

export const workspace = new WorkspaceImpl();

// ========================================
// window
// ========================================

export interface OutputChannel extends Disposable {
  append(value: string): void;
  appendLine(value: string): void;
  clear(): void;
  show(preserveFocus?: boolean): void;
  hide(): void;
}

class OutputChannelImpl extends Disposable implements OutputChannel {
  constructor(_name: string) {
    super(() => {});
  }

  append(value: string): void {
    process.stdout.write(value);
  }

  appendLine(value: string): void {
    console.log(value);
  }

  clear(): void {
    // no-op
  }

  show(_preserveFocus?: boolean): void {
    // no-op
  }

  hide(): void {
    // no-op
  }
}

class WindowImpl {
  createOutputChannel(name: string): OutputChannel {
    return new OutputChannelImpl(name);
  }

  showInformationMessage(message: string, ..._items: string[]): Promise<string | undefined> {
    console.log(`[info] ${message}`);
    return Promise.resolve(undefined);
  }

  showWarningMessage(message: string, ..._items: string[]): Promise<string | undefined> {
    console.warn(`[warn] ${message}`);
    return Promise.resolve(undefined);
  }

  showErrorMessage(message: string, ..._items: string[]): Promise<string | undefined> {
    console.error(`[error] ${message}`);
    return Promise.resolve(undefined);
  }
}

export const window = new WindowImpl();

// ========================================
// commands
// ========================================

const commandRegistry = new Map<string, (...args: any[]) => any>();

class CommandsImpl {
  registerCommand(command: string, callback: (...args: any[]) => any): Disposable {
    commandRegistry.set(command, callback);
    return new Disposable(() => {
      commandRegistry.delete(command);
    });
  }

  async executeCommand<T = unknown>(command: string, ...args: any[]): Promise<T | undefined> {
    const callback = commandRegistry.get(command);
    if (callback) {
      return callback(...args);
    }
    console.warn(`[vscode-shim] Command not found: ${command}`);
    return undefined;
  }
}

export const commands = new CommandsImpl();

// ========================================
// languages
// ========================================

export interface DocumentSelector {
  language?: string;
  scheme?: string;
  pattern?: string;
}

class LanguagesImpl {
  registerCompletionItemProvider(): Disposable {
    // no-op（RadiusはLSP経由で補完を処理する）
    return new Disposable(() => {});
  }

  registerHoverProvider(): Disposable {
    return new Disposable(() => {});
  }

  registerDefinitionProvider(): Disposable {
    return new Disposable(() => {});
  }

  match(selector: DocumentSelector | DocumentSelector[], document: TextDocument): number {
    // 簡易マッチング
    const selectors = Array.isArray(selector) ? selector : [selector];
    for (const sel of selectors) {
      if (sel.language && sel.language === document.languageId) {
        return 10;
      }
    }
    return 0;
  }
}

export const languages = new LanguagesImpl();

// ========================================
// ExtensionContext
// ========================================

export interface ExtensionContext {
  subscriptions: Disposable[];
  extensionPath: string;
  globalStoragePath: string;
  logPath: string;
  storagePath?: string;
  extensionUri: Uri;
  extensionMode: ExtensionMode;
  asAbsolutePath(relativePath: string): string;
}

export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3,
}

/**
 * ExtensionContext を作成する（ローダから呼ばれる）。
 */
export function createExtensionContext(extensionPath: string): ExtensionContext {
  return {
    subscriptions: [],
    extensionPath,
    globalStoragePath: extensionPath,
    logPath: extensionPath,
    storagePath: extensionPath,
    extensionUri: Uri.file(extensionPath),
    extensionMode: ExtensionMode.Production,
    asAbsolutePath(relativePath: string): string {
      // path モジュールを使用して相対パスを解決
      const path = require("path");
      return path.resolve(extensionPath, relativePath);
    },
  };
}

// ========================================
// extensions
// ========================================

export interface Extension<T> {
  id: string;
  extensionPath: string;
  isActive: boolean;
  packageJSON: any;
  exports: T;
  activate(): Promise<T>;
}

const extensionRegistry = new Map<string, Extension<any>>();

class ExtensionsImpl {
  getExtension<T = any>(extensionId: string): Extension<T> | undefined {
    return extensionRegistry.get(extensionId);
  }

  get all(): Extension<any>[] {
    return Array.from(extensionRegistry.values());
  }
}

export const extensions = new ExtensionsImpl();

/**
 * 拡張を登録する（ローダから呼ばれる）。
 */
export function registerExtension(id: string, extension: Extension<any>): void {
  extensionRegistry.set(id, extension);
}

// ========================================
// その他のエクスポート
// ========================================

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3,
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}

// デフォルトエクスポート（一部の拡張は module.exports でアクセスする）
export default {
  Uri,
  Position,
  Range,
  Location,
  Diagnostic,
  DiagnosticSeverity,
  Disposable,
  workspace,
  window,
  commands,
  languages,
  extensions,
  ConfigurationTarget,
  StatusBarAlignment,
  TextEditorRevealType,
  ViewColumn,
  ExtensionMode,
};
