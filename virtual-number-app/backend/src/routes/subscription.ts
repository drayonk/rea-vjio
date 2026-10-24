import { Router } from "express";
import { userIdOf } from "../auth.js";
import type { Deps } from "../app.js";
import { subscriptionView, syncPlan } from "../subscription.js";
import { handle } from "../validation.js";

export function subscriptionRoutes(deps: Deps) {
  const r = Router();

  r.get("/", handle((req, res) => res.json(subscriptionView(deps, userIdOf(req)))));

  /** Called by the app right after a purchase or restore, before the webhook lands. */
  r.post(
    "/refresh",
    handle(async (req, res) => {
      const userId = userIdOf(req);
      await syncPlan(deps, userId);
      res.json(subscriptionView(deps, userId));
    }),
  );

  return r;
}
