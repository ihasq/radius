/**
 * RDSX Import Prefix Resolver
 *
 * Resolves import specifiers with prefixes (npm:, jsr:, https:, gh:)
 * to local file paths.
 */

import { resolve } from "node:path";

export type RdsxPrefix = "npm" | "jsr" | "https" | "gh";

export interface ParsedImport {
  prefix: RdsxPrefix;
  path: string;
}

/**
 * Parse import specifier and extract prefix and path
 *
 * @param specifier - Import specifier (e.g., "npm:typescript")
 * @returns Parsed prefix and path
 * @throws Error if prefix is unknown
 */
export function parseImportSpecifier(specifier: string): ParsedImport {
  if (specifier.startsWith("npm:")) {
    return { prefix: "npm", path: specifier.slice(4) };
  }
  if (specifier.startsWith("jsr:")) {
    return { prefix: "jsr", path: specifier.slice(4) };
  }
  if (specifier.startsWith("gh:")) {
    return { prefix: "gh", path: specifier.slice(3) };
  }
  if (specifier.startsWith("https://")) {
    return { prefix: "https", path: specifier };
  }

  throw new Error(`Unknown import prefix: ${specifier}`);
}

/**
 * Resolve npm: prefix to node_modules path
 *
 * @param packageName - Package name (e.g., "typescript")
 * @returns Path to package in node_modules
 */
function resolveNpm(packageName: string): string {
  try {
    // Try to use require.resolve for accurate resolution
    return require.resolve(packageName);
  } catch {
    // Fallback to node_modules path
    return resolve(process.cwd(), "node_modules", packageName);
  }
}

/**
 * Resolve jsr: prefix to cache path
 *
 * @param path - JSR package path (e.g., "@std/schema")
 * @param radiusHome - Radius home directory
 * @returns Path to cached JSR package
 */
function resolveJsr(path: string, radiusHome: string): string {
  return resolve(radiusHome, "rdsx-cache/jsr", path);
}

/**
 * Resolve https: prefix to cache path
 *
 * @param url - HTTPS URL
 * @param radiusHome - Radius home directory
 * @returns Path to cached HTTPS resource
 */
function resolveHttps(url: string, radiusHome: string): string {
  const urlWithoutProtocol = url.replace("https://", "");
  return resolve(radiusHome, "rdsx-cache/https", urlWithoutProtocol);
}

/**
 * Resolve gh: prefix to cache path
 *
 * @param path - GitHub path (e.g., "user/repo/src/parser.ts")
 * @param radiusHome - Radius home directory
 * @returns Path to cached GitHub resource
 */
function resolveGitHub(path: string, radiusHome: string): string {
  return resolve(radiusHome, "rdsx-cache/gh", path);
}

/**
 * Resolve import specifier to local file path
 *
 * @param specifier - Import specifier with prefix
 * @param radiusHome - Radius home directory
 * @returns Resolved local file path
 * @throws Error if prefix is unknown
 */
export function resolvePrefix(specifier: string, radiusHome: string): string {
  const { prefix, path } = parseImportSpecifier(specifier);

  switch (prefix) {
    case "npm":
      return resolveNpm(path);
    case "jsr":
      return resolveJsr(path, radiusHome);
    case "https":
      return resolveHttps(path, radiusHome);
    case "gh":
      return resolveGitHub(path, radiusHome);
  }
}
