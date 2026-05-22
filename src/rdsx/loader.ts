/**
 * RDSX Extension Loader
 *
 * Dynamically loads RDSX extensions from rdsx.toml configuration.
 */

import { parseRdsxToml } from "./toml-parser";
import { resolve, dirname } from "node:path";
import type { RdsxRegistry } from "./registry";

/**
 * Load RDSX extension from rdsx.toml and register it
 *
 * @param tomlPath - Path to rdsx.toml file
 * @param registry - RdsxRegistry instance to register the extension
 * @param radiusHome - Radius home directory for prefix resolution
 * @throws Error if entry file doesn't export activate()
 */
export async function loadFromToml(
  tomlPath: string,
  registry: RdsxRegistry,
  radiusHome: string
): Promise<void> {
  const config = parseRdsxToml(tomlPath);
  const entryPath = resolve(dirname(tomlPath), config.extension.entry);

  // Dynamically import the entry file
  const mod = await import(entryPath);

  if (typeof mod.activate !== "function") {
    throw new Error(
      `rdsx entry ${entryPath} must export activate() function`
    );
  }

  // Call activate() to get the extension instance
  const extension = await mod.activate();

  // Register the extension
  registry.register(extension);
}
