/** Guest session tokens are stored per room in localStorage. */
export interface StoredSession {
  token: string;
  playerId: string;
  savedAt: number;
}

const key = (code: string) => `gn:session:${code.toUpperCase()}`;

export function loadSession(code: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(code: string, token: string, playerId: string) {
  try {
    localStorage.setItem(key(code), JSON.stringify({ token, playerId, savedAt: Date.now() }));
    localStorage.setItem("gn:lastRoom", code.toUpperCase());
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

export function clearSession(code: string) {
  try {
    localStorage.removeItem(key(code));
  } catch {}
}

export function lastRoom(): string | null {
  try {
    return localStorage.getItem("gn:lastRoom");
  } catch {
    return null;
  }
}

export function newActionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
