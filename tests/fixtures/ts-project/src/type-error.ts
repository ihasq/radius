export function add(a: number, b: number): number {
  return a + b;
}

export const result: string = add(1, 2); // 型エラー: number を string に代入
