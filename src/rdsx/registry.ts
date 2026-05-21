/**
 * RdsxRegistry - Unified extension registry
 *
 * Manages all RDSX extensions (analyzers, commands, debuggers, tools)
 * Replaces the old rdsx-resolver with a unified registration system.
 */

import type {
  RdsxExtension,
  RdsxKind,
  RdsxAnalyzer,
} from "./types";

/**
 * Central registry for all RDSX extensions
 */
export class RdsxRegistry {
  private extensions = new Map<string, RdsxExtension>();

  /**
   * Register an extension
   */
  register(ext: RdsxExtension): void {
    this.extensions.set(ext.name, ext);
  }

  /**
   * Get all extensions of a specific kind
   */
  getByKind(kind: RdsxKind): RdsxExtension[] {
    return [...this.extensions.values()].filter((e) => e.kind === kind);
  }

  /**
   * Get analyzer for a specific language
   */
  getAnalyzer(languageId: string): RdsxAnalyzer | null {
    const analyzers = this.getByKind("analyzer") as RdsxAnalyzer[];
    return analyzers.find((a) => a.languageIds.includes(languageId)) ?? null;
  }

  /**
   * Activate all registered extensions
   */
  async activateAll(): Promise<void> {
    for (const ext of this.extensions.values()) {
      await ext.activate();
    }
  }

  /**
   * Deactivate all registered extensions
   */
  async deactivateAll(): Promise<void> {
    for (const ext of this.extensions.values()) {
      await ext.deactivate();
    }
  }

  /**
   * Get extension by name
   */
  get(name: string): RdsxExtension | undefined {
    return this.extensions.get(name);
  }

  /**
   * Get all registered extensions
   */
  getAll(): RdsxExtension[] {
    return [...this.extensions.values()];
  }
}
