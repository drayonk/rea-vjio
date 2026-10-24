import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Router } from "express";
import { z } from "zod";
import { userIdOf } from "../auth.js";
import { now } from "../db.js";
import type { Deps } from "../app.js";
import { getUser, ownedNumber } from "../repo.js";
import { assertAllowed } from "../subscription.js";
import { HttpError, e164, handle } from "../validation.js";

interface CallRow {
  id: string;
  direction: "inbound" | "outbound";
  counterpart: string;
  status: string;
  duration_seconds: number | null;
  voicemail_url: string | null;
  voicemail_seconds: number | null;
  created_at: string;
}

const publicCall = (c: CallRow) => ({
  id: c.id,
  direction: c.direction,
  counterpart: c.counterpart,
  status: c.status,
  durationSeconds: c.duration_seconds,
  hasVoicemail: Boolean(c.voicemail_url),
  voicemailSeconds: c.voicemail_seconds,
  createdAt: c.created_at,
});

/** Mounted at /numbers/:numberId */
export function callRoutes(deps: Deps) {
  const { db, config, telephony } = deps;
  const r = Router({ mergeParams: true });

  r.get(
    "/calls",
    handle((req, res) => {
      const n = ownedNumber(db, userIdOf(req), req.params.numberId!);
      const rows = db
        .prepare("SELECT * FROM calls WHERE number_id = ? ORDER BY created_at DESC LIMIT 200")
        .all(n.id) as unknown as CallRow[];
      res.json(rows.map(publicCall));
    }),
  );

  r.post(
    "/calls",
    handle(async (req, res) => {
      const userId = userIdOf(req);
      const n = ownedNumber(db, userId, req.params.numberId!);
      if (!n.voice) throw new HttpError(400, "This number does not support calls");
      assertAllowed(deps, userId, "call");
      const { to } = z.object({ to: e164 }).parse(req.body);
      const user = getUser(db, userId);
      if (!user?.forward_to) {
        throw new HttpError(400, "Add your real phone number in Settings to place calls");
      }
      const call = await telephony.bridgeCall({
        virtualNumber: n.e164,
        userPhone: user.forward_to,
        destination: to,
        statusCallback: `${config.publicBaseUrl}/webhooks/call-status`,
      });
      const id = randomUUID();
      db.prepare(
        `INSERT INTO calls (id, number_id, direction, counterpart, status, provider_sid, created_at)
         VALUES (?, ?, 'outbound', ?, ?, ?, ?)`,
      ).run(id, n.id, to, call.status, call.providerSid, now());
      const row = db.prepare("SELECT * FROM calls WHERE id = ?").get(id) as unknown as CallRow;
      res.status(201).json(publicCall(row));
    }),
  );

  r.get(
    "/calls/:callId/voicemail",
    handle(async (req, res) => {
      const n = ownedNumber(db, userIdOf(req), req.params.numberId!);
      const call = db
        .prepare("SELECT voicemail_url FROM calls WHERE id = ? AND number_id = ?")
        .get(req.params.callId!, n.id) as { voicemail_url: string | null } | undefined;
      if (!call?.voicemail_url) throw new HttpError(404, "no voicemail");
      const upstream = await telephony.fetchRecording(call.voicemail_url);
      if (!upstream.ok || !upstream.body) throw new HttpError(502, "voicemail unavailable");
      res.setHeader("content-type", upstream.headers.get("content-type") ?? "audio/mpeg");
      Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream).pipe(res);
    }),
  );

  return r;
}
