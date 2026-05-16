import { PI } from "./math-constants"

export function calculateCircleArea(radius: number): number {
  return PI * radius * radius;
}

export function greet(name: string): string {
  return `Hello, ${name}!`;
}
