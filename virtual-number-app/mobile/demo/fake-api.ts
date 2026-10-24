// In-browser stand-in for the SecondLine backend, used only by the web demo.
// It mirrors the real API's routes, plan limits and error codes, with fake
// numbers, a bot that replies to texts, and no real carrier or payments.
import { PLANS, type PlanId } from "../../backend/src/plan-limits";

interface DemoUser {
  id: string;
  email: string;
  password: string;
  forwardTo: string | null;
  forwardingEnabled: boolean;
  doNotDisturb: boolean;
  plan: PlanId;
  expiresAt: string | null;
}
interface DemoNumber {
  id: string;
  userId: string;
  e164: string;
  country: string;
  locality: string | null;
  label: string | null;
  callsEnabled: boolean;
  createdAt: string;
}
interface DemoMessage {
  id: string;
  numberId: string;
  direction: "inbound" | "outbound";
  counterpart: string;
  body: string;
  status: string;
  read: boolean;
  createdAt: string;
}
interface DemoCall {
  id: string;
  numberId: string;
  direction: "inbound" | "outbound";
  counterpart: string;
  status: string;
  durationSeconds: number | null;
  createdAt: string;
}
interface State {
  users: DemoUser[];
  numbers: DemoNumber[];
  messages: DemoMessage[];
  calls: DemoCall[];
}

const STORAGE_KEY = "secondline.demo.v1";
const DIAL: Record<string, string> = { US: "1", CA: "1", GB: "44", AU: "61", DE: "49", FR: "33", NL: "31" };
const CITY: Record<string, string> = { US: "San Francisco", CA: "Toronto", GB: "London", AU: "Sydney", DE: "Berlin", FR: "Paris", NL: "Amsterdam" };
const BOT = "+15550102030";
const REPLIES = [
  "Got it, thanks! 👍",
  "Sounds good. Is tomorrow at 10 OK?",
  "Can you send me more details?",
  "Perfect, see you then.",
  "Haha, nice. Talk soon!",
];

function load(): State {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as State;
  } catch {
    // Storage can be unavailable in sandboxed or private views; start fresh.
  }
  return { users: [], numbers: [], messages: [], calls: [] };
}
const state = load();
const save = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Non-persistent demo is fine.
  }
};

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const later = (ms: number, fn: () => void) => setTimeout(() => (fn(), save()), ms);

class Fail {
  constructor(
    readonly status: number,
    readonly error: string,
    readonly code?: string,
  ) {}
}
const upgrade = (error: string) => new Fail(402, error, "upgrade_required");

const publicUser = (u: DemoUser) => ({
  id: u.id,
  email: u.email,
  forwardTo: u.forwardTo,
  forwardingEnabled: u.forwardingEnabled,
  doNotDisturb: u.doNotDisturb,
});
const publicNumber = (n: DemoNumber) => ({
  id: n.id,
  e164: n.e164,
  country: n.country,
  locality: n.locality,
  label: n.label,
  sms: true,
  voice: true,
  callsEnabled: n.callsEnabled,
  createdAt: n.createdAt,
});
const publicCall = (c: DemoCall) => ({ ...c, hasVoicemail: false, voicemailSeconds: null });

function usage(userId: string) {
  const since = Date.now() - 30 * 86_400_000;
  const mine = state.numbers.filter((n) => n.userId === userId).map((n) => n.id);
  return {
    numbers: mine.length,
    sms: state.messages.filter((m) => mine.includes(m.numberId) && m.direction === "outbound" && Date.parse(m.createdAt) >= since).length,
    minutes: Math.ceil(
      state.calls.filter((c) => mine.includes(c.numberId)).reduce((s, c) => s + (c.durationSeconds ?? 0), 0) / 60,
    ),
  };
}
function subscription(u: DemoUser) {
  return {
    paywallEnabled: true,
    plan: u.plan,
    expiresAt: u.expiresAt,
    releaseAt: null,
    limits: PLANS[u.plan],
    usage: usage(u.id),
    plans: { premium: PLANS.premium, pro: PLANS.pro },
  };
}

/** Called by the demo store when the viewer "buys" a plan or skips the paywall. */
export function grantPlan(userId: string, plan: Exclude<PlanId, "free">) {
  const u = state.users.find((x) => x.id === userId);
  if (!u) return;
  u.plan = plan;
  u.expiresAt = new Date(Date.now() + (plan === "pro" ? 365 : 30) * 86_400_000).toISOString();
  save();
}

function inbound(n: DemoNumber, from: string, body: string) {
  state.messages.push({ id: id(), numberId: n.id, direction: "inbound", counterpart: from, body, status: "received", read: false, createdAt: now() });
}

function route(method: string, path: string, body: Record<string, unknown>, token: string | null) {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const parts = pathname!.split("/").filter(Boolean);

  if (method === "POST" && pathname === "/auth/register") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Fail(400, "Enter a valid email");
    if (password.length < 8) throw new Fail(400, "Password must be at least 8 characters");
    if (state.users.some((u) => u.email === email)) throw new Fail(409, "An account with this email already exists");
    const u: DemoUser = { id: id(), email, password, forwardTo: null, forwardingEnabled: false, doNotDisturb: false, plan: "free", expiresAt: null };
    state.users.push(u);
    return [201, { token: `demo.${u.id}`, user: publicUser(u) }] as const;
  }
  if (method === "POST" && pathname === "/auth/login") {
    const u = state.users.find((x) => x.email === String(body.email ?? "").trim().toLowerCase() && x.password === body.password);
    if (!u) throw new Fail(401, "Incorrect email or password");
    return [200, { token: `demo.${u.id}`, user: publicUser(u) }] as const;
  }

  const user = state.users.find((u) => token === `demo.${u.id}`);
  if (!user) throw new Fail(401, "unauthorized");

  if (pathname === "/me") {
    if (method === "GET") return [200, publicUser(user)] as const;
    if (method === "PATCH") {
      if (body.forwardTo !== undefined) user.forwardTo = (body.forwardTo as string | null) ?? null;
      if (body.forwardingEnabled !== undefined) user.forwardingEnabled = Boolean(body.forwardingEnabled);
      if (body.doNotDisturb !== undefined) user.doNotDisturb = Boolean(body.doNotDisturb);
      if (user.forwardingEnabled && !user.forwardTo) {
        user.forwardingEnabled = false;
        throw new Fail(400, "Set a forwarding number first");
      }
      return [200, publicUser(user)] as const;
    }
    if (method === "DELETE") {
      if (body.password !== user.password) throw new Fail(403, "Incorrect password");
      const mine = new Set(state.numbers.filter((n) => n.userId === user.id).map((n) => n.id));
      state.messages = state.messages.filter((m) => !mine.has(m.numberId));
      state.calls = state.calls.filter((c) => !mine.has(c.numberId));
      state.numbers = state.numbers.filter((n) => n.userId !== user.id);
      state.users = state.users.filter((u) => u.id !== user.id);
      return [204, null] as const;
    }
  }
  if (pathname === "/me/push-token") return [204, null] as const;
  if (pathname === "/subscription" || pathname === "/subscription/refresh") return [200, subscription(user)] as const;

  if (parts[0] !== "numbers") throw new Fail(404, "not found");
  const limits = PLANS[user.plan];

  if (parts.length === 2 && parts[1] === "available") {
    const country = params.get("country") ?? "US";
    const code = DIAL[country] ?? "1";
    const area = params.get("areaCode") || (code === "1" ? "415" : "20");
    const contains = params.get("contains") ?? "";
    const taken = new Set(state.numbers.map((n) => n.e164));
    const list = Array.from({ length: 20 }, (_, i) => {
      const sub = String(5550100 + i * 37).padStart(7, "0");
      return {
        e164: `+${code}${area}${sub}`,
        friendlyName: `(${area}) ${sub.slice(0, 3)}-${sub.slice(3)}`,
        locality: CITY[country] ?? null,
        region: null,
        country,
        sms: true,
        voice: true,
      };
    }).filter((n) => !taken.has(n.e164) && n.e164.includes(contains));
    return [200, list] as const;
  }
  if (parts.length === 1) {
    const mine = state.numbers.filter((n) => n.userId === user.id);
    if (method === "GET") return [200, mine.map(publicNumber)] as const;
    if (method === "POST") {
      if (mine.length >= limits.numbers) {
        throw upgrade(
          user.plan === "free"
            ? "Subscribe to get your second number."
            : `Your plan includes ${limits.numbers} number${limits.numbers === 1 ? "" : "s"}. Upgrade to add more.`,
        );
      }
      const n: DemoNumber = {
        id: id(),
        userId: user.id,
        e164: String(body.e164),
        country: String(body.country ?? "US"),
        locality: (body.locality as string | null) ?? null,
        label: (body.label as string | undefined) ?? null,
        callsEnabled: true,
        createdAt: now(),
      };
      state.numbers.push(n);
      later(3000, () =>
        inbound(n, BOT, "Welcome to your SecondLine demo number! Reply to this text and I'll answer, like a real contact would."),
      );
      later(7000, () =>
        state.calls.push({
          id: id(),
          numberId: n.id,
          direction: "inbound",
          counterpart: "+16465550111",
          status: n.callsEnabled ? "missed" : "declined",
          durationSeconds: null,
          createdAt: now(),
        }),
      );
      return [201, publicNumber(n)] as const;
    }
  }

  const n = state.numbers.find((x) => x.id === parts[1] && x.userId === user.id);
  if (!n) throw new Fail(404, "number not found");
  const rest = parts.slice(2).join("/");

  if (rest === "") {
    if (method === "PATCH") {
      if (body.label !== undefined) n.label = (body.label as string | null) || null;
      if (body.callsEnabled !== undefined) n.callsEnabled = Boolean(body.callsEnabled);
      return [200, publicNumber(n)] as const;
    }
    if (method === "DELETE") {
      state.numbers = state.numbers.filter((x) => x.id !== n.id);
      return [204, null] as const;
    }
  }
  if (rest === "conversations") {
    const mine = state.messages.filter((m) => m.numberId === n.id);
    const byCounterpart = new Map<string, DemoMessage[]>();
    for (const m of mine) byCounterpart.set(m.counterpart, [...(byCounterpart.get(m.counterpart) ?? []), m]);
    const list = [...byCounterpart.entries()]
      .map(([counterpart, ms]) => ({
        counterpart,
        unread: ms.filter((m) => m.direction === "inbound" && !m.read).length,
        last: ms.at(-1)!,
      }))
      .sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
    return [200, list] as const;
  }
  if (parts[2] === "conversations" && parts[3]) {
    const counterpart = decodeURIComponent(parts[3]);
    const thread = state.messages.filter((m) => m.numberId === n.id && m.counterpart === counterpart);
    const snapshot = thread.map((m) => ({ ...m }));
    for (const m of thread) if (m.direction === "inbound") m.read = true;
    return [200, snapshot] as const;
  }
  if (rest === "messages" && method === "POST") {
    if (user.plan === "free") throw upgrade("Your subscription has ended. Renew to keep using your numbers.");
    if (usage(user.id).sms >= limits.smsPerMonth) throw upgrade(`You've used all ${limits.smsPerMonth} texts in the last 30 days. Upgrade for more.`);
    const to = String(body.to ?? "");
    if (!/^\+[1-9]\d{6,14}$/.test(to)) throw new Fail(400, "Use international format, e.g. +14155550123");
    const m: DemoMessage = { id: id(), numberId: n.id, direction: "outbound", counterpart: to, body: String(body.body ?? ""), status: "delivered", read: true, createdAt: now() };
    state.messages.push(m);
    later(2500, () => inbound(n, to, REPLIES[Math.floor(Math.random() * REPLIES.length)]!));
    return [201, m] as const;
  }
  if (rest === "calls") {
    if (method === "GET") {
      const list = state.calls.filter((c) => c.numberId === n.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return [200, list.map(publicCall)] as const;
    }
    if (method === "POST") {
      if (!n.callsEnabled) throw new Fail(400, "Calls are turned off for this number");
      if (user.plan === "free") throw upgrade("Your subscription has ended. Renew to keep using your numbers.");
      if (!user.forwardTo) throw new Fail(400, "Add your real phone number in Settings to place calls");
      const c: DemoCall = { id: id(), numberId: n.id, direction: "outbound", counterpart: String(body.to), status: "queued", durationSeconds: null, createdAt: now() };
      state.calls.push(c);
      later(4000, () => Object.assign(c, { status: "completed", durationSeconds: 47 }));
      return [201, publicCall(c)] as const;
    }
  }
  throw new Fail(404, "not found");
}

/** Answers requests to `apiUrl` from memory instead of the network. */
export function installFakeApi(apiUrl: string) {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(`${apiUrl}/api`)) return realFetch(input, init);
    const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? null;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    await new Promise((r) => setTimeout(r, 150)); // feel like a network
    try {
      const [status, payload] = route(init?.method ?? "GET", url.slice(apiUrl.length + 4), body, token);
      save();
      return new Response(payload === null ? null : JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    } catch (err) {
      if (!(err instanceof Fail)) throw err;
      return new Response(JSON.stringify({ error: err.error, ...(err.code ? { code: err.code } : {}) }), {
        status: err.status,
        headers: { "content-type": "application/json" },
      });
    }
  };
}
