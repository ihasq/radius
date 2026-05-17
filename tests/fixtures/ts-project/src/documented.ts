/**
 * Calculates the area of a circle.
 * @param radius - The radius of the circle
 * @returns The area
 */
export function circleArea(radius: number): number {
  return Math.PI * radius * radius;
}

/**
 * User profile interface.
 */
export interface UserProfile {
  /** The user's unique identifier */
  id: string;
  /** The user's display name */
  name: string;
}
