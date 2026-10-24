import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { planFromEntitlements } from "../src/billing/revenuecat.js";
import type { BillingProvider, PlanState } from "../src/billing/types.js";
import { releaseLapsedNumbers } from "../src/subscription.js";
import { startApp, type TestApp } from "./helpers.js";

const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

class FakeBilling implements BillingProvider {
  readonly plans = new Map<string, PlanState>();
  async fetchPlan(userId: string) {
    return this.plans.get(userId) ?? { plan: "free" as const, expiresAt: null };
  }
  verifyWebhook(authorization: string | undefined) {
    return authorization === "Bearer hook-secret";
  }
  readonly deleted: string[] = [];
  async deleteCustomer(userId: string) {
    this.deleted.push(userId);
  }
}

describe("subscriptions (paywall on)", () => {
  const billing = new FakeBilling();
  let app: TestApp;
  let user: { token: string; id: string };
  let numberId = "";
  let e164 = "";

  before(async () => {
    app = await startApp({ billing });
    user = await app.signup("payer@example.com");
  });
  after(() => app.close());

  const sub = async () => (await app.call("GET", "/api/subscription", undefined, user.token)).body;
  const available = async () =>
    (await app.call("GET", "/api/numbers/available?country=US&limit=2", undefined, user.token)).body;
  const rcWebhook = (auth: string) =>
    app.call("POST", "/billing/revenuecat/webhook", { event: { type: "RENEWAL", app_user_id: user.id } }, undefined, {
      authorization: auth,
    });

  test("new users are on the free plan and hit the paywall", async () => {
    const s = await sub();
    assert.equal(s.paywallEnabled, true);
    assert.equal(s.plan, "free");
    assert.deepEqual(s.plans.premium, { numbers: 1, smsPerMonth: 1000, minutesPerMonth: 300 });
    const [n] = await available();
    const res = await app.call("POST", "/api/numbers", n, user.token);
    assert.equal(res.status, 402);
    assert.equal(res.body.code, "upgrade_required");
    assert.match(res.body.error, /Subscribe/);
  });

  test("a purchase unlocks the plan after refresh, with plan-sized limits", async () => {
    billing.plans.set(user.id, { plan: "premium", expiresAt: iso(30 * DAY) });
    const s = (await app.call("POST", "/api/subscription/refresh", undefined, user.token)).body;
    assert.equal(s.plan, "premium");
    assert.equal(s.releaseAt, null);

    const [first, second] = await available();
    const bought = await app.call("POST", "/api/numbers", first, user.token);
    assert.equal(bought.status, 201);
    numberId = bought.body.id;
    e164 = bought.body.e164;
    const more = await app.call("POST", "/api/numbers", second, user.token);
    assert.equal(more.status, 402);
    assert.match(more.body.error, /includes 1 number/);
  });

  test("meters texts and call minutes over a rolling 30 days", async () => {
    const send = () => app.call("POST", `/api/numbers/${numberId}/messages`, { to: "+15551230000", body: "hi" }, user.token);
    assert.equal((await send()).status, 201);

    const insert = app.deps.db.prepare(
      `INSERT INTO messages (id, number_id, direction, counterpart, body, status, created_at)
       VALUES (?, ?, 'outbound', '+15551230000', 'x', 'sent', ?)`,
    );
    for (let i = 0; i < 999; i++) insert.run(`bulk-${i}`, numberId, iso(-i * 1000));
    insert.run("old", numberId, iso(-31 * DAY)); // outside the window, not counted
    assert.equal((await sub()).usage.sms, 1000);
    const capped = await send();
    assert.equal(capped.status, 402);
    assert.match(capped.body.error, /all 1000 texts/);

    await app.call("PATCH", "/api/me", { forwardTo: "+15550001111", forwardingEnabled: true }, user.token);
    const ring = await app.webhook("/voice", { From: "+15559990000", To: e164, CallSid: "CA-fwd" });
    assert.match(ring.text, /<Dial/);
    app.deps.db
      .prepare(
        `INSERT INTO calls (id, number_id, direction, counterpart, status, duration_seconds, created_at)
         VALUES ('long', ?, 'outbound', '+15557778888', 'completed', ?, ?)`,
      )
      .run(numberId, 300 * 60, iso(-DAY));
    assert.equal((await sub()).usage.minutes, 300);
    const call = await app.call("POST", `/api/numbers/${numberId}/calls`, { to: "+15557778888" }, user.token);
    assert.equal(call.status, 402);
    const toVoicemail = await app.webhook("/voice", { From: "+15559990000", To: e164, CallSid: "CA-cap" });
    assert.match(toVoicemail.text, /<Record /);
    assert.doesNotMatch(toVoicemail.text, /<Dial/);
  });

  test("webhooks require the shared secret and re-sync the plan", async () => {
    billing.plans.set(user.id, { plan: "pro", expiresAt: iso(30 * DAY) });
    assert.equal((await rcWebhook("Bearer wrong")).status, 401);
    assert.equal((await sub()).plan, "premium");
    assert.equal((await rcWebhook("Bearer hook-secret")).status, 200);
    assert.equal((await sub()).plan, "pro");
  });

  test("a lapsed plan blocks outbound use and schedules release after the grace period", async () => {
    const endedAt = iso(-DAY);
    billing.plans.set(user.id, { plan: "free", expiresAt: endedAt });
    await rcWebhook("Bearer hook-secret");
    const s = await sub();
    assert.equal(s.plan, "free");
    assert.equal(s.releaseAt, new Date(new Date(endedAt).getTime() + 7 * DAY).toISOString());

    const blocked = await app.call("POST", `/api/numbers/${numberId}/messages`, { to: "+15551230000", body: "hi" }, user.token);
    assert.equal(blocked.status, 402);
    assert.match(blocked.body.error, /subscription has ended/);
    // Inbound texts still arrive, so renewing restores the full history.
    await app.webhook("/sms", { From: "+15551230000", To: e164, Body: "still there?", MessageSid: "SM-lapsed" });
    const convo = await app.call("GET", `/api/numbers/${numberId}/conversations`, undefined, user.token);
    assert.equal(convo.body[0].last.body, "still there?");

    assert.equal(await releaseLapsedNumbers(app.deps, new Date(Date.now() + 5 * DAY)), 0);
    assert.equal(await releaseLapsedNumbers(app.deps, new Date(Date.now() + 7 * DAY)), 1);
    assert.equal(app.telephony.released.length, 1);
    assert.equal((await app.call("GET", "/api/numbers", undefined, user.token)).body.length, 0);
  });

  test("renewed and failing releases keep their numbers", async () => {
    const other = await app.signup("renewer@example.com");
    billing.plans.set(other.id, { plan: "premium", expiresAt: iso(30 * DAY) });
    await app.call("POST", "/api/subscription/refresh", undefined, other.token);
    const [n] = (await app.call("GET", "/api/numbers/available?country=US&areaCode=646&limit=1", undefined, other.token)).body;
    assert.equal((await app.call("POST", "/api/numbers", n, other.token)).status, 201);
    assert.equal(await releaseLapsedNumbers(app.deps, new Date(Date.now() + 20 * DAY)), 0);

    billing.plans.set(other.id, { plan: "free", expiresAt: iso(-10 * DAY) });
    await app.call("POST", "/api/subscription/refresh", undefined, other.token);
    const release = app.telephony.release.bind(app.telephony);
    app.telephony.release = async () => {
      throw new Error("carrier down");
    };
    assert.equal(await releaseLapsedNumbers(app.deps), 0);
    app.telephony.release = release;
    assert.equal(await releaseLapsedNumbers(app.deps), 1);
  });
});

describe("RevenueCat entitlement mapping", () => {
  const at = new Date("2026-06-01T00:00:00Z");

  test("picks the best active entitlement", () => {
    assert.deepEqual(
      planFromEntitlements(
        {
          premium: { expires_date: "2026-07-01T00:00:00Z" },
          pro: { expires_date: "2026-06-15T00:00:00Z" },
        },
        at,
      ),
      { plan: "pro", expiresAt: "2026-06-15T00:00:00.000Z" },
    );
  });

  test("honours the store billing grace period", () => {
    assert.deepEqual(
      planFromEntitlements(
        { premium: { expires_date: "2026-05-30T00:00:00Z", grace_period_expires_date: "2026-06-05T00:00:00Z" } },
        at,
      ),
      { plan: "premium", expiresAt: "2026-06-05T00:00:00.000Z" },
    );
  });

  test("falls back to a lower plan, then to free with the last end date", () => {
    assert.equal(
      planFromEntitlements(
        { pro: { expires_date: "2026-05-01T00:00:00Z" }, premium: { expires_date: "2026-08-01T00:00:00Z" } },
        at,
      ).plan,
      "premium",
    );
    assert.deepEqual(
      planFromEntitlements(
        { pro: { expires_date: "2026-05-01T00:00:00Z" }, premium: { expires_date: "2026-05-20T00:00:00Z" } },
        at,
      ),
      { plan: "free", expiresAt: "2026-05-20T00:00:00.000Z" },
    );
    assert.deepEqual(planFromEntitlements({}, at), { plan: "free", expiresAt: null });
  });

  test("treats a non-expiring entitlement as lifetime", () => {
    assert.deepEqual(planFromEntitlements({ premium: { expires_date: null } }, at), { plan: "premium", expiresAt: null });
  });
});
