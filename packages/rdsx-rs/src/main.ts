/**
 * RDSX-RS Entry Point
 */

import { RustAdapter } from "./adapter";
import type { RdsxAnalyzer } from "../../../src/rdsx/types";

export function activate(): RdsxAnalyzer {
  return new RustAdapter("file://");
}
