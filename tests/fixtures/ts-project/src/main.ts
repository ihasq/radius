export const userName: string = "default_user";

export function greet(): string {
  return `Hello, ${userName}!`;
}

export function calculate(a: number, b: number): number {
  return a + b;
}

export function processData(data: string[]): string {
  return data.join(", ");
}

export function initialize(): void {
  console.log("Initializing application...");
}
