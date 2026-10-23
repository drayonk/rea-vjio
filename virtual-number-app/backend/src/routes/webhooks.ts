import { randomUUID } from "node:crypto";
import express, { Router, type NextFunction, type Request, type Response } from "express";
import { now } from "../db.js";
import type { Deps } from "../app.js";
import { activeNumberByE164, getUser, type NumberRow } from "../repo.js";
import { twiml } from "../telephony/twiml.js";

type Params = Record<string, string>;
const params = (req: Request) => (req.body ?? {}) as Params;

const sendXml = (res: Response, xml: string) => res.type("text/xml").send(xml);

/** Carrier-facing endpoints. Every request must carry a valid provider signature. */
export function webhookRoutes({ db, config, telephony, push }: Deps) {
  const r = Router();
  r.use(express.urlencoded({ extended: false }));
  r.use((req: Request, res: Response, next: NextFunction) => {
    const url = `${config.publicBaseUrl}${req.originalUrl}`;
    if (!telephony.verifyWebhook(url, params(req), req.header("x-twilio-signature"))) {
      res.status(403).send("invalid signature");
      return;
    }
    next();
  });

  const notify = (number: NumberRow, title: string, body: string, data: Params) => {
    const user = getUser(db, number.user_id);
    if (user?.push_token && !user.do_not_disturb) {
      void push({ to: user.push_token, title, body, data: { numberId: number.id, ...data } });
    }
  };

  const callNumber = (callSid: string | undefined) =>
    callSid
      ? (db
          .prepare("SELECT n.* FROM calls c JOIN numbers n ON n.id = c.number_id WHERE c.provider_sid = ?")
          .get(callSid) as NumberRow | undefined)
      : undefined;

  const voicemailPrompt = () =>
    twiml.response(
      twiml.say("The person you are calling is unavailable. Please leave a message after the tone."),
      twiml.record(`${config.publicBaseUrl}/webhooks/voicemail`),
      twiml.hangup(),
    );

  r.post("/sms", (req, res) => {
    const { From, To, Body, MessageSid } = params(req);
    const number = To ? activeNumberByE164(db, To) : undefined;
    if (number && From && MessageSid) {
      const inserted = db
        .prepare(
          `INSERT OR IGNORE INTO messages (id, number_id, direction, counterpart, body, status, provider_sid, created_at)
           VALUES (?, ?, 'inbound', ?, ?, 'received', ?, ?)`,
        )
        .run(randomUUID(), number.id, From, Body ?? "", MessageSid, now());
      if (inserted.changes > 0) {
        notify(number, From, Body ?? "", { type: "sms", counterpart: From });
      }
    }
    sendXml(res, twiml.empty());
  });

  r.post("/sms-status", (req, res) => {
    const { MessageSid, MessageStatus } = params(req);
    if (MessageSid && MessageStatus) {
      db.prepare("UPDATE messages SET status = ? WHERE provider_sid = ?").run(MessageStatus, MessageSid);
    }
    res.status(204).end();
  });

  r.post("/voice", (req, res) => {
    const { From, To, CallSid } = params(req);
    const number = To ? activeNumberByE164(db, To) : undefined;
    if (!number || !From || !CallSid) {
      sendXml(res, twiml.response(twiml.say("This number is not in service."), twiml.hangup()));
      return;
    }
    db.prepare(
      `INSERT OR IGNORE INTO calls (id, number_id, direction, counterpart, status, provider_sid, created_at)
       VALUES (?, ?, 'inbound', ?, 'ringing', ?, ?)`,
    ).run(randomUUID(), number.id, From, CallSid, now());

    const user = getUser(db, number.user_id);
    if (user?.forwarding_enabled && user.forward_to && !user.do_not_disturb) {
      sendXml(
        res,
        twiml.response(
          twiml.dial(user.forward_to, { action: `${config.publicBaseUrl}/webhooks/voice/after-dial`, timeout: 20 }),
        ),
      );
    } else {
      sendXml(res, voicemailPrompt());
    }
  });

  r.post("/voice/after-dial", (req, res) => {
    const { CallSid, DialCallStatus, DialCallDuration } = params(req);
    if (DialCallStatus === "completed") {
      db.prepare("UPDATE calls SET status = 'completed', duration_seconds = ? WHERE provider_sid = ?").run(
        Number(DialCallDuration ?? 0),
        CallSid ?? "",
      );
      sendXml(res, twiml.response(twiml.hangup()));
      return;
    }
    db.prepare("UPDATE calls SET status = 'missed' WHERE provider_sid = ?").run(CallSid ?? "");
    sendXml(res, voicemailPrompt());
  });

  r.post("/voicemail", (req, res) => {
    const { CallSid, RecordingUrl, RecordingDuration } = params(req);
    const number = callNumber(CallSid);
    if (number && RecordingUrl) {
      db.prepare(
        "UPDATE calls SET status = 'voicemail', voicemail_url = ?, voicemail_seconds = ? WHERE provider_sid = ?",
      ).run(RecordingUrl, Number(RecordingDuration ?? 0), CallSid!);
      const call = db.prepare("SELECT counterpart FROM calls WHERE provider_sid = ?").get(CallSid!) as {
        counterpart: string;
      };
      notify(number, "New voicemail", `From ${call.counterpart}`, { type: "voicemail" });
    }
    sendXml(res, twiml.response(twiml.hangup()));
  });

  r.post("/call-status", (req, res) => {
    const { CallSid, CallStatus, CallDuration } = params(req);
    if (CallSid && CallStatus) {
      db.prepare("UPDATE calls SET status = ?, duration_seconds = ? WHERE provider_sid = ?").run(
        CallStatus,
        CallDuration ? Number(CallDuration) : null,
        CallSid,
      );
    }
    res.status(204).end();
  });

  return r;
}
