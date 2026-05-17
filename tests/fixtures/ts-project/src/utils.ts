import { userName } from "./main";

export function getUserInfo(): string {
  return `User: ${userName}`;
}

export function formatMessage(message: string): string {
  return `[${userName}] ${message}`;
}
