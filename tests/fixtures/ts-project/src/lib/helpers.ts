import { PI } from "./constants";

export function calc(radius: number): number {
  return PI * radius * radius;
}

export function format(value: number): string {
  return `Result: ${value.toFixed(2)}`;
}
