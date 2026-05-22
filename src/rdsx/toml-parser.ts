/**
 * RDSX TOML Parser
 *
 * Parses rdsx.toml configuration files for RDSX extensions.
 */

import { parse } from "smol-toml";
import { readFileSync } from "node:fs";

export interface RdsxTomlConfig {
  extension: {
    name: string;
    version: string;
    kind: "analyzer" | "command" | "debugger" | "tool";
    description: string;
    entry: string;
  };
  analyzer?: {
    language_ids: string[];
    depth_max: number;
  };
  runtime?: {
    engine: string;
    min_version: string;
  };
}

/**
 * Parse rdsx.toml configuration file
 *
 * @param filePath - Path to rdsx.toml
 * @returns Parsed configuration
 * @throws Error if file doesn't exist or required fields are missing
 */
export function parseRdsxToml(filePath: string): RdsxTomlConfig {
  const content = readFileSync(filePath, "utf-8");
  const parsed = parse(content) as any;

  if (!parsed.extension?.name || !parsed.extension?.kind) {
    throw new Error(
      "rdsx.toml: extension.name and extension.kind are required"
    );
  }

  return parsed as RdsxTomlConfig;
}
