import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { userIdOf } from "../auth.js";
import { now } from "../db.js";
import type { Deps } from "../app.js";
import { ownedNumber, publicNumber, type NumberRow } from "../repo.js";
import { assertAllowed } from "../subscription.js";
import { e164, handle } from "../validation.js";

const search = z.object({
  country: z.string().regex(/^[A-Z]{2}$/, "country must be an ISO code like US"),
  areaCode: z.string().regex(/^\d{2,5}$/).optional(),
  contains: z.string().regex(/^\d{1,10}$/).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});

const purchase = z.object({
  e164,
  country: z.string().regex(/^[A-Z]{2}$/),
  locality: z.string().max(100).nullable().optional(),
  sms: z.boolean().default(true),
  voice: z.boolean().default(true),
  label: z.string().trim().max(40).optional(),
});

export function numberRoutes(deps: Deps) {
  const { db, config, telephony } = deps;
  const r = Router();

  r.get(
    "/available",
    handle(async (req, res) => {
      res.json(await telephony.searchAvailable(search.parse(req.query)));
    }),
  );

  r.get(
    "/",
    handle((req, res) => {
      const rows = db
        .prepare("SELECT * FROM numbers WHERE user_id = ? AND released_at IS NULL ORDER BY created_at")
        .all(userIdOf(req)) as unknown as NumberRow[];
      res.json(rows.map(publicNumber));
    }),
  );

  r.post(
    "/",
    handle(async (req, res) => {
      const userId = userIdOf(req);
      const p = purchase.parse(req.body);
      assertAllowed(deps, userId, "number");
      const provisioned = await telephony.purchase(p.e164, {
        sms: `${config.publicBaseUrl}/webhooks/sms`,
        voice: `${config.publicBaseUrl}/webhooks/voice`,
      });
      const id = randomUUID();
      db.prepare(
        `INSERT INTO numbers (id, user_id, provider_sid, e164, country, locality, label, sms, voice, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        userId,
        provisioned.providerSid,
        provisioned.e164,
        p.country,
        p.locality ?? null,
        p.label ?? null,
        p.sms ? 1 : 0,
        p.voice ? 1 : 0,
        now(),
      );
      res.status(201).json(publicNumber(ownedNumber(db, userId, id)));
    }),
  );

  r.patch(
    "/:id",
    handle((req, res) => {
      const userId = userIdOf(req);
      const n = ownedNumber(db, userId, req.params.id!);
      const patch = z
        .object({ label: z.string().trim().max(40).nullable().optional(), callsEnabled: z.boolean().optional() })
        .parse(req.body);
      const label = patch.label === undefined ? n.label : patch.label || null;
      const calls = patch.callsEnabled ?? Boolean(n.calls_enabled);
      db.prepare("UPDATE numbers SET label = ?, calls_enabled = ? WHERE id = ?").run(label, calls ? 1 : 0, n.id);
      res.json(publicNumber(ownedNumber(db, userId, n.id)));
    }),
  );

  r.delete(
    "/:id",
    handle(async (req, res) => {
      const n = ownedNumber(db, userIdOf(req), req.params.id!);
      await telephony.release(n.provider_sid);
      db.prepare("UPDATE numbers SET released_at = ? WHERE id = ?").run(now(), n.id);
      res.status(204).end();
    }),
  );

  return r;
}
