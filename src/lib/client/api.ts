import type { ApiError, RoomPreview, SessionResponse, StateResponse } from "@/lib/shared/protocol";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
  get isNetwork() {
    return this.status === 0;
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiRequestError("You're offline or the server can't be reached. Retrying…", 0, "network");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(err.error ?? `Request failed (${res.status})`, res.status, err.code ?? "error");
  }
  return data as T;
}

export const api = {
  createRoom: (name: string, avatar?: string) =>
    request<SessionResponse>("/api/rooms", { method: "POST", body: JSON.stringify({ name, avatar }) }),
  preview: (code: string) => request<RoomPreview>(`/api/rooms/${encodeURIComponent(code)}`),
  join: (code: string, body: { name: string; avatar?: string; spectator?: boolean }) =>
    request<SessionResponse>(`/api/rooms/${encodeURIComponent(code)}/join`, { method: "POST", body: JSON.stringify(body) }),
  sync: (code: string, token: string) =>
    request<StateResponse>(`/api/rooms/${encodeURIComponent(code)}/sync`, { method: "POST", token }),
  action: (code: string, token: string, command: object) =>
    request<(StateResponse & { duplicate?: boolean }) | { left: true }>(`/api/rooms/${encodeURIComponent(code)}/action`, {
      method: "POST",
      token,
      body: JSON.stringify(command),
    }),
  handoff: (code: string, token: string) =>
    request<{ handoff: string; expiresAt: number }>(`/api/rooms/${encodeURIComponent(code)}/handoff`, {
      method: "POST",
      token,
    }),
  redeem: (code: string, handoff: string) =>
    request<SessionResponse>(`/api/rooms/${encodeURIComponent(code)}/redeem`, {
      method: "POST",
      body: JSON.stringify({ handoff }),
    }),
};
