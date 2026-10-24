import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { openDb } from "../src/db.js";
import { TwilioProvider } from "../src/telephony/twilio.js";
import { checkTwilioSetup } from "../src/telephony/twilio-setup.js";

/** Minimal stand-in for the Twilio REST API that records every request. */
function fakeTwilio() {
  const requests: Array<{ method: string; path: string; auth: string; form: Record<string, string> }> = [];
  const numbers = new Map([
    ["PN1", { sid: "PN1", phone_number: "+14155550100", sms_url: "https://old.example/sms", voice_url: "https://old.example/voice" }],
    ["PN2", { sid: "PN2", phone_number: "+14155550199", sms_url: "https://other-app/sms", voice_url: "" }],
  ]);
  let accountType = "Full";
  const read = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => resolve(body));
    });
  const server = createServer(async (req, res) => {
    const path = req.url!.replace("/2010-04-01/Accounts/AC123", "");
    const form = Object.fromEntries(new URLSearchParams(await read(req)));
    requests.push({ method: req.method!, path, auth: req.headers.authorization ?? "", form });
    const json = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (req.headers.authorization !== `Basic ${Buffer.from("AC123:tok").toString("base64")}`) {
      return json(401, { message: "Authenticate" });
    }
    if (path === ".json") return json(200, { sid: "AC123", friendly_name: "SecondLine prod", status: "active", type: accountType });
    if (path.startsWith("/IncomingPhoneNumbers.json") && req.method === "GET") {
      return json(200, { incoming_phone_numbers: [...numbers.values()] });
    }
    const update = /^\/IncomingPhoneNumbers\/(\w+)\.json$/.exec(path);
    if (update && req.method === "POST") {
      const n = numbers.get(update[1]!)!;
      n.sms_url = form.SmsUrl!;
      n.voice_url = form.VoiceUrl!;
      return json(200, n);
    }
    if (path === "/Calls.json") return json(201, { sid: "CA9", status: "queued" });
    if (path === "/Messages.json") return json(201, { sid: "SM9", status: "queued" });
    return json(404, { message: `no route ${path}` });
  });
  return { server, requests, setTrial: () => (accountType = "Trial") };
}

describe("Twilio connection", () => {
  const fake = fakeTwilio();
  let twilio: TwilioProvider;
  const config = { publicBaseUrl: "https://api.secondline.test" };
  const db = openDb(":memory:");

  before(async () => {
    fake.server.listen(0);
    await new Promise((r) => fake.server.once("listening", r));
    const port = (fake.server.address() as AddressInfo).port;
    twilio = new TwilioProvider("AC123", "tok", `http://127.0.0.1:${port}/2010-04-01`);
    db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'a@b.c', 'x', '2026-01-01')").run();
    db.prepare(
      `INSERT INTO numbers (id, user_id, provider_sid, e164, country, sms, voice, created_at)
       VALUES ('n1', 'u1', 'PN1', '+14155550100', 'US', 1, 1, '2026-01-01')`,
    ).run();
  });
  after(() => fake.server.close());

  const healthy = { fetchHealth: async () => true };

  test("reports wrong webhooks, then repoints only SecondLine's numbers with --fix", async () => {
    const check = await checkTwilioSetup(twilio, db, config, { fix: false, ...healthy });
    assert.equal(check.ok, false);
    assert.match(check.lines.join("\n"), /✓ Signed in to Twilio account "SecondLine prod"/);
    assert.match(check.lines.join("\n"), /✗ \+14155550100 sends texts\/calls to https:\/\/old.example\/sms/);
    assert.match(check.lines.join("\n"), /\+14155550199 is in the Twilio account but not used by SecondLine/);

    const fixed = await checkTwilioSetup(twilio, db, config, { fix: true, ...healthy });
    assert.equal(fixed.ok, true, fixed.lines.join("\n"));
    const update = fake.requests.find((r) => r.method === "POST" && r.path === "/IncomingPhoneNumbers/PN1.json")!;
    assert.deepEqual(update.form, {
      SmsUrl: "https://api.secondline.test/webhooks/sms",
      SmsMethod: "POST",
      VoiceUrl: "https://api.secondline.test/webhooks/voice",
      VoiceMethod: "POST",
    });
    assert.equal(fake.requests.filter((r) => r.path.includes("PN2") && r.method === "POST").length, 0);
    assert.equal((await checkTwilioSetup(twilio, db, config, { fix: false, ...healthy })).ok, true);
  });

  test("flags bad credentials, non-HTTPS or unreachable URLs, and trial accounts", async () => {
    const port = (fake.server.address() as AddressInfo).port;
    const bad = new TwilioProvider("AC123", "wrong", `http://127.0.0.1:${port}/2010-04-01`);
    const denied = await checkTwilioSetup(bad, db, config, { fix: false, ...healthy });
    assert.match(denied.lines.join("\n"), /✗ Credentials rejected: Authenticate/);
    const offline = new TwilioProvider("AC123", "tok", "http://127.0.0.1:1/2010-04-01");
    const unreachable = await checkTwilioSetup(offline, db, config, { fix: false, ...healthy });
    assert.match(unreachable.lines.join("\n"), /✗ Couldn't reach Twilio/);

    const local = await checkTwilioSetup(twilio, db, { publicBaseUrl: "http://localhost:4000" }, { fix: false, ...healthy });
    assert.match(local.lines.join("\n"), /✗ PUBLIC_BASE_URL must be a public HTTPS address/);
    const down = await checkTwilioSetup(twilio, db, config, { fix: false, fetchHealth: async () => false });
    assert.match(down.lines.join("\n"), /✗ https:\/\/api.secondline.test\/health didn't answer/);

    fake.setTrial();
    const trial = await checkTwilioSetup(twilio, db, config, { fix: false, ...healthy });
    assert.match(trial.lines.join("\n"), /✗ This is a trial account/);
  });

  test("sends texts and bridge calls in the form Twilio expects", async () => {
    await twilio.sendSms({ from: "+14155550100", to: "+15551230000", body: "hi & bye", statusCallback: "https://x/s" });
    assert.deepEqual(fake.requests.at(-1)!.form, { From: "+14155550100", To: "+15551230000", Body: "hi & bye", StatusCallback: "https://x/s" });
    await twilio.bridgeCall({ virtualNumber: "+14155550100", userPhone: "+15550001111", answerUrl: "https://x/bridge", statusCallback: "https://x/c" });
    assert.deepEqual(fake.requests.at(-1)!.form, {
      To: "+15550001111",
      From: "+14155550100",
      Url: "https://x/bridge",
      StatusCallback: "https://x/c",
      StatusCallbackEvent: "completed",
    });
  });
});
