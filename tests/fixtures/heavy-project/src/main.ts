import { readFileSync } from "node:fs";

export function loadFile(path: string): string {
  return readFileSync(path, "utf-8");
}

export const config = loadFile("./config.json");
