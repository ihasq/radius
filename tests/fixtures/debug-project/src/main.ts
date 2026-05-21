/**
 * Debug test program
 */

function add(a: number, b: number): number {
  const result = a + b;
  return result;
}

function multiply(x: number, y: number): number {
  const product = x * y;
  return product;
}

function main(): void {
  console.log("Starting debug test program...");

  const num1 = 10;
  const num2 = 20;

  const sum = add(num1, num2);
  console.log(`Sum: ${sum}`);

  const product = multiply(num1, num2);
  console.log(`Product: ${product}`);

  console.log("Program finished.");
}

main();
