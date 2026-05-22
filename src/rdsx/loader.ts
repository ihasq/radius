/**
 * RDSX Extension Loader
 *
 * Dynamically loads RDSX extensions from rdsx.toml configuration.
 */

import { parseRdsxToml } from "./toml-parser";
import { resolve, dirname, join } from "node:path";
import { readdirSync } from "node:fs";
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

/**
 * Load all RDSX packages from a directory
 *
 * @param packagesDir - Directory containing RDSX packages
 * @param registry - RdsxRegistry instance to register extensions
 * @param radiusHome - Radius home directory for prefix resolution
 */
export async function loadAllPackages(
  packagesDir: string,
  registry: RdsxRegistry,
  radiusHome: string
): Promise<void> {
  const dirs = readdirSync(packagesDir, { withFileTypes: true }).filter(
    (d) => d.isDirectory() && d.name.startsWith("rdsx-")
  );

  for (const dir of dirs) {
    const tomlPath = join(packagesDir, dir.name, "rdsx.toml");
    try {
      await loadFromToml(tomlPath, registry, radiusHome);
    } catch (e) {
      // LSP not installed or activation failed - skip this package
      // This is expected for external LSPs like rust-analyzer, gopls, etc.
    }
  }
}
