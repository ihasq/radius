import { calculateCircleArea } from "./lib/helpers";

export const userName: string = "default_user";

export function greet(): string {
  return `Hello, ${userName}!`;
}

export function isAdmin(): boolean {
  return userName === "admin";
}

export function getUserInfo() {
  return {
    name: userName,
    role: isAdmin() ? "admin" : "user",
  };
}

export function getArea(radius: number): number {
  return calculateCircleArea(radius);
}
