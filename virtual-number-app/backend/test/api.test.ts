import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { TwilioProvider } from "../src/telephony/twilio.js";
import { startApp, type TestApp } from "./helpers.js";

let app: TestApp;
let telephony: TestApp["telephony"];
let pushes: TestApp["pushes"];
let base = "";
let call: TestApp["call"];
let webhook: TestApp["webhook"];

before(async () => {
  app = await startApp();
  ({ telephony, pushes, base, call, webhook } = app);
});
after(() => app.close());

const signup = async (email: string) => (await app.signup(email)).token;

describe("SecondLine API", () => {
  let token = "";
  let numberId = "";
  let e164 = "";

  test("registers, rejects duplicates and bad logins", async () => {
    token = await signup("Alice@Example.com");
    assert.equal((await call("POST", "/api/auth/register", { email: "alice@example.com", password: "correct horse" })).status, 409);
    assert.equal((await call("POST", "/api/auth/login", { email: "alice@example.com", password: "wrong pass" })).status, 401);
    assert.equal((await call("POST", "/api/auth/login", { email: "alice@example.com", password: "correct horse" })).status, 200);
    assert.equal((await call("GET", "/api/numbers")).status, 401);
  });

  test("searches and buys numbers up to the plan limit (Pro when the paywall is off)", async () => {
    assert.equal((await call("GET", "/api/subscription", undefined, token)).body.paywallEnabled, false);
    const found = await call("GET", "/api/numbers/available?country=US&areaCode=212&limit=4", undefined, token);
    assert.equal(found.status, 200);
    assert.equal(found.body.length, 4);
    const [first, second, third, fourth] = found.body;
    const bought = await call("POST", "/api/numbers", { ...first, label: "Work" }, token);
    assert.equal(bought.status, 201);
    assert.equal(bought.body.label, "Work");
    numberId = bought.body.id;
    e164 = bought.body.e164;
    assert.equal((await call("POST", "/api/numbers", second, token)).status, 201);
    assert.equal((await call("POST", "/api/numbers", third, token)).status, 201);
    const overLimit = await call("POST", "/api/numbers", fourth, token);
    assert.equal(overLimit.status, 402);
    assert.equal(overLimit.body.code, "upgrade_required");
    assert.equal((await call("GET", "/api/numbers", undefined, token)).body.length, 3);
  });

  test("hides numbers from other users", async () => {
    const bob = await signup("bob@example.com");
    assert.equal((await call("GET", `/api/numbers/${numberId}/conversations`, undefined, bob)).status, 404);
    assert.equal((await call("DELETE", `/api/numbers/${numberId}`, undefined, bob)).status, 404);
  });

  test("sends SMS and receives replies as a conversation", async () => {
    const sent = await call("POST", `/api/numbers/${numberId}/messages`, { to: "+15551230000", body: "Hi!" }, token);
    assert.equal(sent.status, 201);
    assert.deepEqual(telephony.sent.at(-1), { from: e164, to: "+15551230000", body: "Hi!" });
    assert.equal((await call("POST", `/api/numbers/${numberId}/messages`, { to: "555", body: "x" }, token)).status, 400);

    await call("PUT", "/api/me/push-token", { token: "ExponentPushToken[abc]" }, token);
    const inbound = { From: "+15551230000", To: e164, Body: "Hello back", MessageSid: "SM1" };
    assert.match((await webhook("/sms", inbound)).text, /<Response\/>/);
    await webhook("/sms", inbound); // carrier retry must not duplicate
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0]!.body, "Hello back");

    const convos = await call("GET", `/api/numbers/${numberId}/conversations`, undefined, token);
    assert.equal(convos.body.length, 1);
    assert.equal(convos.body[0].unread, 1);
    assert.equal(convos.body[0].last.body, "Hello back");

    const thread = await call("GET", `/api/numbers/${numberId}/conversations/${encodeURIComponent("+15551230000")}`, undefined, token);
    assert.deepEqual(thread.body.map((m: { body: string }) => m.body), ["Hi!", "Hello back"]);
    const after = await call("GET", `/api/numbers/${numberId}/conversations`, undefined, token);
    assert.equal(after.body[0].unread, 0);
  });

  test("routes inbound calls to forwarding or voicemail", async () => {
    const voicemail = await webhook("/voice", { From: "+15559990000", To: e164, CallSid: "CA1" });
    assert.match(voicemail.text, /<Record /);

    assert.equal((await call("PATCH", "/api/me", { forwardingEnabled: true }, token)).status, 400);
    const me = await call("PATCH", "/api/me", { forwardTo: "+15550001111", forwardingEnabled: true }, token);
    assert.equal(me.body.forwardingEnabled, true);
    const forwarded = await webhook("/voice", { From: "+15559990000", To: e164, CallSid: "CA2" });
    assert.match(
      forwarded.text,
      /<Dial action="[^"]+after-dial" timeout="25"><Number url="[^"]+\/voice\/screen">\+15550001111<\/Number><\/Dial>/,
    );

    const missed = await webhook("/voice/after-dial", { CallSid: "CA2", DialCallStatus: "no-answer" });
    assert.match(missed.text, /<Record /);
    await webhook("/voicemail", {
      CallSid: "CA2",
      RecordingUrl: "https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1",
      RecordingDuration: "7",
    });
    const calls = await call("GET", `/api/numbers/${numberId}/calls`, undefined, token);
    const ca2 = calls.body.find((c: { status: string }) => c.status === "voicemail");
    assert.equal(ca2.voicemailSeconds, 7);
    const audio = await fetch(`${base}/api/numbers/${numberId}/calls/${ca2.id}/voicemail`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(audio.headers.get("content-type"), "audio/mpeg");
    assert.equal(pushes.at(-1)!.title, "New voicemail");

    const unknown = await webhook("/voice", { From: "+15559990000", To: "+19990000000", CallSid: "CA3" });
    assert.match(unknown.text, /not in service/);
  });

  test("forwarded calls connect only after the user presses 1", async () => {
    const statusOf = async (sid: string) =>
      (app.deps.db.prepare("SELECT status FROM calls WHERE provider_sid = ?").get(sid) as { status: string }).status;

    // The user's phone voicemail picks up: nobody presses 1, so the caller
    // never hears the personal greeting and gets SecondLine voicemail instead.
    await webhook("/voice", { From: "+15559990000", To: e164, CallSid: "CA-vm" });
    const screen = await webhook("/voice/screen", { CallSid: "CA-child", ParentCallSid: "CA-vm" });
    assert.match(screen.text, /<Gather numDigits="1"[^>]+screen-result"><Say>[^<]+Press 1/);
    assert.match(screen.text, /<\/Gather><Hangup\/>/);
    assert.match((await webhook("/voice/screen-result", { ParentCallSid: "CA-vm" })).text, /<Hangup\/>/);
    const afterVm = await webhook("/voice/after-dial", { CallSid: "CA-vm", DialCallStatus: "completed", DialCallDuration: "9" });
    assert.match(afterVm.text, /<Record /);
    assert.equal(await statusOf("CA-vm"), "missed");

    await webhook("/voice", { From: "+15559990000", To: e164, CallSid: "CA-ok" });
    const accepted = await webhook("/voice/screen-result", { ParentCallSid: "CA-ok", Digits: "1" });
    assert.match(accepted.text, /<Response\/>/);
    const afterOk = await webhook("/voice/after-dial", { CallSid: "CA-ok", DialCallStatus: "completed", DialCallDuration: "42" });
    assert.match(afterOk.text, /<Hangup\/>/);
    assert.equal(await statusOf("CA-ok"), "completed");
  });

  test("bridges outbound calls through the user's phone after a key press", async () => {
    const res = await call("POST", `/api/numbers/${numberId}/calls`, { to: "+15557778888" }, token);
    assert.equal(res.status, 201);
    const placed = telephony.calls.at(-1)!;
    assert.equal(placed.virtualNumber, e164);
    assert.equal(placed.userPhone, "+15550001111");
    assert.match(placed.answerUrl, /\/webhooks\/voice\/bridge$/);
    const { provider_sid: sid } = app.deps.db.prepare("SELECT provider_sid FROM calls WHERE id = ?").get(res.body.id) as {
      provider_sid: string;
    };

    const prompt = await webhook("/voice/bridge", { CallSid: sid });
    assert.match(prompt.text, /<Gather [^>]+bridge-connect"><Say>[^<]+Press 1/);
    assert.doesNotMatch(prompt.text, /<Dial/);
    // Personal voicemail answered the bridge leg: the callee is never dialed.
    assert.match((await webhook("/voice/bridge-connect", { CallSid: sid })).text, /cancelled/);
    const connect = await webhook("/voice/bridge-connect", { CallSid: sid, Digits: "1" });
    assert.match(connect.text, new RegExp(`<Dial callerId="\\${e164}">\\+15557778888</Dial>`));
    assert.doesNotMatch(connect.text, /15550001111/);
  });

  test("calls can be turned off per number", async () => {
    const off = await call("PATCH", `/api/numbers/${numberId}`, { callsEnabled: false }, token);
    assert.equal(off.body.callsEnabled, false);
    const renamed = await call("PATCH", `/api/numbers/${numberId}`, { label: "Selling" }, token);
    assert.equal(renamed.body.callsEnabled, false, "a label edit keeps calls off");

    const inbound = await webhook("/voice", { From: "+15550002222", To: e164, CallSid: "CA-off" });
    assert.match(inbound.text, /<Reject reason="busy"\/>/);
    assert.doesNotMatch(inbound.text, /<Dial|<Record/);
    const log = await call("GET", `/api/numbers/${numberId}/calls`, undefined, token);
    assert.equal(log.body[0].status, "declined");

    const outbound = await call("POST", `/api/numbers/${numberId}/calls`, { to: "+15557778888" }, token);
    assert.equal(outbound.status, 400);
    assert.match(outbound.body.error, /turned off/);
    // A bridge already in flight cannot connect once calls are switched off.
    const { provider_sid: sid } = app.deps.db
      .prepare("SELECT provider_sid FROM calls WHERE direction = 'outbound' ORDER BY rowid DESC LIMIT 1")
      .get() as { provider_sid: string };
    assert.match((await webhook("/voice/bridge-connect", { CallSid: sid, Digits: "1" })).text, /cancelled/);

    // Texting keeps working.
    assert.equal((await call("POST", `/api/numbers/${numberId}/messages`, { to: "+15551230000", body: "hi" }, token)).status, 201);
    assert.equal((await call("PATCH", `/api/numbers/${numberId}`, { callsEnabled: true }, token)).body.callsEnabled, true);
  });

  test("releases a number and frees the slot", async () => {
    assert.equal((await call("DELETE", `/api/numbers/${numberId}`, undefined, token)).status, 204);
    assert.equal(telephony.released.length, 1);
    assert.equal((await call("GET", "/api/numbers", undefined, token)).body.length, 2);
    const inbound = await webhook("/voice", { From: "+15559990000", To: e164, CallSid: "CA4" });
    assert.match(inbound.text, /not in service/);
  });
});

describe("Twilio webhook signatures", () => {
  const provider = new TwilioProvider("AC1", "secret-token");
  const url = "https://api.example.com/webhooks/sms";
  const params = { To: "+1415", From: "+1212", Body: "hi" };
  const sign = (p: Record<string, string>) =>
    createHmac("sha1", "secret-token")
      .update(Object.keys(p).sort().reduce((acc, k) => acc + k + p[k], url))
      .digest("base64");

  test("accepts genuine and rejects tampered or missing signatures", () => {
    assert.equal(provider.verifyWebhook(url, params, sign(params)), true);
    assert.equal(provider.verifyWebhook(url, { ...params, Body: "evil" }, sign(params)), false);
    assert.equal(provider.verifyWebhook(url, params, undefined), false);
  });
});
