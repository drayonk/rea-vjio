import type { AddressInfo } from "node:net";
import { createApp, type Deps } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import type { PushMessage } from "../src/push.js";
import { MockProvider } from "../src/telephony/mock.js";

export async function startApp(overrides: Partial<Deps> = {}, env: NodeJS.ProcessEnv = {}) {
  const pushes: PushMessage[] = [];
  const telephony = new MockProvider();
  const deps: Deps = {
    config: loadConfig({ AUTH_SECRET: "x".repeat(32), ...env }),
    db: openDb(":memory:"),
    telephony,
    push: async (m) => void pushes.push(m),
    billing: null,
    ...overrides,
  };
  const server = createApp(deps).listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function call(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    const json = text && res.headers.get("content-type")?.includes("json");
    return { status: res.status, body: json ? JSON.parse(text) : text };
  }

  async function webhook(path: string, form: Record<string, string>) {
    const res = await fetch(`${base}/webhooks${path}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });
    return { status: res.status, text: await res.text() };
  }

  async function signup(email: string) {
    const res = await call("POST", "/api/auth/register", { email, password: "correct horse" });
    if (res.status !== 201) throw new Error(`signup failed: ${JSON.stringify(res.body)}`);
    return { token: res.body.token as string, id: res.body.user.id as string };
  }

  return { deps, telephony, pushes, base, call, webhook, signup, close: () => server.close() };
}

export type TestApp = Awaited<ReturnType<typeof startApp>>;
