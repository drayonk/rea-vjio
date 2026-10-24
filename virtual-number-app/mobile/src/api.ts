import type { AvailableNumber, Call, Conversation, Message, Subscription, User, VirtualNumber } from "./types";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Server reason code; "upgrade_required" means the plan doesn't allow it. */
    readonly code?: string,
  ) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: () => void = () => {};

export function configureApi(next: { token: string | null; onUnauthorized?: () => void }) {
  token = next.token;
  if (next.onUnauthorized) onUnauthorized = next.onUnauthorized;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 0);
  }
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.code);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const n = (id: string) => `/numbers/${encodeURIComponent(id)}`;
type Session = { token: string; user: User };

export const api = {
  register: (email: string, password: string) => request<Session>("POST", "/auth/register", { email, password }),
  login: (email: string, password: string) => request<Session>("POST", "/auth/login", { email, password }),
  me: () => request<User>("GET", "/me"),
  updateMe: (patch: Partial<Pick<User, "forwardTo" | "forwardingEnabled" | "doNotDisturb">>) =>
    request<User>("PATCH", "/me", patch),
  deleteAccount: (password: string) => request<void>("DELETE", "/me", { password }),
  setPushToken: (pushToken: string | null) => request<void>("PUT", "/me/push-token", { token: pushToken }),
  subscription: () => request<Subscription>("GET", "/subscription"),
  refreshSubscription: () => request<Subscription>("POST", "/subscription/refresh"),

  searchNumbers: (q: { country: string; areaCode?: string; contains?: string }) => {
    const params = new URLSearchParams({ country: q.country });
    if (q.areaCode) params.set("areaCode", q.areaCode);
    if (q.contains) params.set("contains", q.contains);
    return request<AvailableNumber[]>("GET", `/numbers/available?${params}`);
  },
  myNumbers: () => request<VirtualNumber[]>("GET", "/numbers"),
  buyNumber: (number: AvailableNumber, label?: string) =>
    request<VirtualNumber>("POST", "/numbers", { ...number, ...(label ? { label } : {}) }),
  updateNumber: (id: string, patch: { label?: string | null; callsEnabled?: boolean }) =>
    request<VirtualNumber>("PATCH", n(id), patch),
  releaseNumber: (id: string) => request<void>("DELETE", n(id)),

  conversations: (id: string) => request<Conversation[]>("GET", `${n(id)}/conversations`),
  thread: (id: string, counterpart: string) =>
    request<Message[]>("GET", `${n(id)}/conversations/${encodeURIComponent(counterpart)}`),
  sendSms: (id: string, to: string, body: string) => request<Message>("POST", `${n(id)}/messages`, { to, body }),

  calls: (id: string) => request<Call[]>("GET", `${n(id)}/calls`),
  placeCall: (id: string, to: string) => request<Call>("POST", `${n(id)}/calls`, { to }),
  voicemailSource: (id: string, callId: string) => ({
    uri: `${API_URL}/api${n(id)}/calls/${encodeURIComponent(callId)}/voicemail`,
    headers: (token ? { authorization: `Bearer ${token}` } : {}) as Record<string, string>,
  }),
};
