/**
 * RDSX-TS Entry Point
 */

import { TsRadProvider } from "./provider";
import type { RdsxAnalyzer } from "../../../src/rdsx/types";

export function activate(): RdsxAnalyzer {
  return new TsRadProvider();
}
