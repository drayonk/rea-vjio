import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { userIdOf } from "../auth.js";
import { now } from "../db.js";
import type { Deps } from "../app.js";
import { ownedNumber } from "../repo.js";
import { assertAllowed } from "../subscription.js";
import { HttpError, e164, handle } from "../validation.js";

interface MessageRow {
  id: string;
  direction: "inbound" | "outbound";
  counterpart: string;
  body: string;
  status: string;
  is_read: number;
  created_at: string;
}

const publicMessage = (m: MessageRow) => ({
  id: m.id,
  direction: m.direction,
  counterpart: m.counterpart,
  body: m.body,
  status: m.status,
  read: Boolean(m.is_read),
  createdAt: m.created_at,
});

const send = z.object({ to: e164, body: z.string().trim().min(1).max(1600) });

/** Mounted at /numbers/:numberId */
export function messageRoutes(deps: Deps) {
  const { db, config, telephony } = deps;
  const r = Router({ mergeParams: true });

  r.get(
    "/conversations",
    handle((req, res) => {
      const n = ownedNumber(db, userIdOf(req), req.params.numberId!);
      const rows = db
        .prepare(
          `SELECT m.*, (SELECT COUNT(*) FROM messages u
                        WHERE u.number_id = m.number_id AND u.counterpart = m.counterpart
                          AND u.direction = 'inbound' AND u.is_read = 0) AS unread
           FROM messages m
           WHERE m.number_id = ? AND m.rowid = (
             SELECT rowid FROM messages l
             WHERE l.number_id = m.number_id AND l.counterpart = m.counterpart
             ORDER BY l.created_at DESC, l.rowid DESC LIMIT 1)
           ORDER BY m.created_at DESC`,
        )
        .all(n.id) as unknown as Array<MessageRow & { unread: number }>;
      res.json(rows.map((m) => ({ counterpart: m.counterpart, unread: m.unread, last: publicMessage(m) })));
    }),
  );

  r.get(
    "/conversations/:counterpart",
    handle((req, res) => {
      const n = ownedNumber(db, userIdOf(req), req.params.numberId!);
      const counterpart = e164.parse(req.params.counterpart);
      const rows = db
        .prepare("SELECT * FROM messages WHERE number_id = ? AND counterpart = ? ORDER BY created_at, rowid")
        .all(n.id, counterpart) as unknown as MessageRow[];
      db.prepare(
        "UPDATE messages SET is_read = 1 WHERE number_id = ? AND counterpart = ? AND direction = 'inbound'",
      ).run(n.id, counterpart);
      res.json(rows.map(publicMessage));
    }),
  );

  r.post(
    "/messages",
    handle(async (req, res) => {
      const userId = userIdOf(req);
      const n = ownedNumber(db, userId, req.params.numberId!);
      if (!n.sms) throw new HttpError(400, "This number does not support SMS");
      assertAllowed(deps, userId, "sms");
      const { to, body } = send.parse(req.body);
      if (to === n.e164) throw new HttpError(400, "Cannot message your own number");
      const sent = await telephony.sendSms({
        from: n.e164,
        to,
        body,
        statusCallback: `${config.publicBaseUrl}/webhooks/sms-status`,
      });
      const id = randomUUID();
      db.prepare(
        `INSERT INTO messages (id, number_id, direction, counterpart, body, status, provider_sid, is_read, created_at)
         VALUES (?, ?, 'outbound', ?, ?, ?, ?, 1, ?)`,
      ).run(id, n.id, to, body, sent.status, sent.providerSid, now());
      const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as unknown as MessageRow;
      res.status(201).json(publicMessage(row));
    }),
  );

  return r;
}
