/**
 * Test RDSX Extension Entry Point
 */

import type { RdsxAnalyzer } from "../../../../src/rdsx/types";

export function activate(): RdsxAnalyzer {
  return {
    kind: "analyzer",
    name: "test-extension",
    version: "0.0.1",
    languageIds: ["test"],

    async activate() {
      // Initialization logic
    },

    async deactivate() {
      // Cleanup logic
    },

    async getSymbols() {
      return [];
    },

    async format() {
      return [];
    },

    async getHoverInfo() {
      return null;
    },

    async findReferences() {
      return [];
    },

    async rename() {
      return [];
    },

    async getDiagnostics() {
      return [];
    },

    async getCodeFixes() {
      return [];
    },
  };
}
