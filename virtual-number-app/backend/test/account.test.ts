import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { BillingProvider } from "../src/billing/types.js";
import { startApp, type TestApp } from "./helpers.js";

const deletedCustomers: string[] = [];
const billing: BillingProvider = {
  fetchPlan: async () => ({ plan: "pro", expiresAt: new Date(Date.now() + 864e5).toISOString() }),
  verifyWebhook: () => false,
  deleteCustomer: async (id) => void deletedCustomers.push(id),
};

let app: TestApp;
before(async () => {
  app = await startApp({ billing });
});
after(() => app.close());

test("deletes the account, its numbers and its history after re-entering the password", async () => {
  const user = await app.signup("leaver@example.com");
  const other = await app.signup("stayer@example.com");
  for (const u of [user, other]) await app.call("POST", "/api/subscription/refresh", undefined, u.token);
  const [a, b, c] = (await app.call("GET", "/api/numbers/available?country=US&limit=3", undefined, user.token)).body;
  const mine = [(await app.call("POST", "/api/numbers", a, user.token)).body, (await app.call("POST", "/api/numbers", b, user.token)).body];
  const theirs = (await app.call("POST", "/api/numbers", c, other.token)).body;
  await app.webhook("/sms", { From: "+15551230000", To: mine[0].e164, Body: "hi", MessageSid: "SM-del" });
  await app.webhook("/voice", { From: "+15551230000", To: mine[0].e164, CallSid: "CA-del" });
  await app.webhook("/sms", { From: "+15551230000", To: theirs.e164, Body: "keep me", MessageSid: "SM-keep" });

  const wrong = await app.call("DELETE", "/api/me", { password: "nope" }, user.token);
  assert.equal(wrong.status, 403);
  assert.equal(app.telephony.released.length, 0);

  // The carrier fails after the first release: the account stays, still owning the rest.
  const release = app.telephony.release.bind(app.telephony);
  let calls = 0;
  app.telephony.release = async (sid) => {
    if (calls++ === 1) throw new Error("carrier down");
    return release(sid);
  };
  assert.equal((await app.call("DELETE", "/api/me", { password: "correct horse" }, user.token)).status, 500);
  const left = await app.call("GET", "/api/numbers", undefined, user.token);
  assert.deepEqual(left.body.map((n: { id: string }) => n.id), [mine[1].id]);
  assert.equal(deletedCustomers.length, 0);

  app.telephony.release = release;
  assert.equal((await app.call("DELETE", "/api/me", { password: "correct horse" }, user.token)).status, 204);
  assert.equal(app.telephony.released.length, 2);
  assert.deepEqual(deletedCustomers, [user.id]);

  const db = app.deps.db;
  const count = (sql: string, ...args: string[]) => (db.prepare(sql).get(...args) as { n: number }).n;
  assert.equal(count("SELECT COUNT(*) AS n FROM users WHERE id = ?", user.id), 0);
  assert.equal(count("SELECT COUNT(*) AS n FROM numbers WHERE user_id = ?", user.id), 0);
  assert.equal(count("SELECT COUNT(*) AS n FROM messages WHERE body = 'hi'"), 0);
  assert.equal(count("SELECT COUNT(*) AS n FROM calls WHERE provider_sid = 'CA-del'"), 0);

  // The old token stops working and the email can sign up again.
  assert.equal((await app.call("GET", "/api/me", undefined, user.token)).status, 401);
  assert.equal((await app.call("POST", "/api/auth/login", { email: "leaver@example.com", password: "correct horse" })).status, 401);
  await app.signup("leaver@example.com");

  // Other users are untouched.
  const kept = await app.call("GET", `/api/numbers/${theirs.id}/conversations`, undefined, other.token);
  assert.equal(kept.body[0].last.body, "keep me");
});
