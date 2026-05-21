import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readConfig(dir: string): string {
  return readFileSync(join(dir, "config.json"), "utf-8");
}
