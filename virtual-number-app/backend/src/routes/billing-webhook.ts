import express, { Router } from "express";
import type { Deps } from "../app.js";
import { getUser } from "../repo.js";
import { syncPlan } from "../subscription.js";
import { handle } from "../validation.js";

interface RevenueCatEvent {
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
}

/**
 * RevenueCat webhook. Event payloads only signal that something changed; the
 * user's state is re-read from RevenueCat so out-of-order or duplicate
 * events cannot leave a stale plan behind.
 */
export function billingWebhookRoutes(deps: Deps) {
  const r = Router();
  r.use(express.json({ limit: "256kb" }));

  r.post(
    "/revenuecat/webhook",
    handle(async (req, res) => {
      if (!deps.billing?.verifyWebhook(req.header("authorization"))) {
        res.status(401).end();
        return;
      }
      const event = ((req.body ?? {}) as { event?: RevenueCatEvent }).event ?? {};
      const ids = new Set(
        [
          event.app_user_id,
          event.original_app_user_id,
          ...(event.aliases ?? []),
          ...(event.transferred_from ?? []),
          ...(event.transferred_to ?? []),
        ].filter((id): id is string => typeof id === "string"),
      );
      // Anonymous RevenueCat ids ($RCAnonymousID:…) never match one of our users.
      for (const id of ids) {
        if (getUser(deps.db, id)) await syncPlan(deps, id);
      }
      res.status(200).json({ ok: true });
    }),
  );

  return r;
}
