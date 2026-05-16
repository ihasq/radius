// Test fixture: 同一ターゲットへの複数import文
import { PI } from "./lib/math-constants"
export { E } from "./lib/math-constants"

export function calculateCircleArea(radius: number): number {
  return PI * radius * radius;
}
