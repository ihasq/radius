/**
 * RDSX-GO Entry Point
 */

import { GoRdsxAnalyzer } from "./adapter";
import type { RdsxAnalyzer } from "../../../src/rdsx/types";

export function activate(): RdsxAnalyzer {
  return new GoRdsxAnalyzer();
}
