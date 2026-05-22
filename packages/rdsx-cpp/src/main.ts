/**
 * RDSX-CPP Entry Point
 */

import { CppRdsxAnalyzer } from "./adapter";
import type { RdsxAnalyzer } from "../../../src/rdsx/types";

export function activate(): RdsxAnalyzer {
  return new CppRdsxAnalyzer();
}
