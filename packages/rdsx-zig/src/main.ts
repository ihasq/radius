/**
 * RDSX-ZIG Entry Point
 */

import { ZigRdsxAnalyzer } from "./adapter";
import type { RdsxAnalyzer } from "../../../src/rdsx/types";

export function activate(): RdsxAnalyzer {
  return new ZigRdsxAnalyzer();
}
