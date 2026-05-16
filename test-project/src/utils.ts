import { userName } from "./main";

export function getWelcomeMessage(): string {
  return `Welcome, ${userName}!`;
}

export function formatUserInfo() {
  return {
    user: userName,
    timestamp: Date.now(),
  };
}
