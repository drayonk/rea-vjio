// Demo replacement for expo-secure-store (not available on web).
import "./setup";

const memory = new Map<string, string>();

export async function getItemAsync(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}
export async function setItemAsync(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Keep it in memory for this visit.
  }
}
export async function deleteItemAsync(key: string) {
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing persisted.
  }
}
