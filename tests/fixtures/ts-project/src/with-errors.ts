import { readFileSync } from "node:fs";
const x: number = "hello";
const unused = 42;
export function broken(a: string): number {
  return a;
}
