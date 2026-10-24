import { Router } from "express";
import { z } from "zod";
import { deleteAccount } from "../account.js";
import { userIdOf, verifyPassword } from "../auth.js";
import type { Deps } from "../app.js";
import { publicUser, requireUser } from "../repo.js";
import { HttpError, e164, handle } from "../validation.js";

const settings = z.object({
  forwardTo: e164.nullable().optional(),
  forwardingEnabled: z.boolean().optional(),
  doNotDisturb: z.boolean().optional(),
});

export function meRoutes(deps: Deps) {
  const { db } = deps;
  const r = Router();

  r.get("/", handle((req, res) => res.json(publicUser(requireUser(db, userIdOf(req))))));

  r.patch(
    "/",
    handle((req, res) => {
      const id = userIdOf(req);
      const s = settings.parse(req.body);
      const user = requireUser(db, id);
      const forwardTo = s.forwardTo === undefined ? user.forward_to : s.forwardTo;
      const forwarding = s.forwardingEnabled ?? Boolean(user.forwarding_enabled);
      if (forwarding && !forwardTo) throw new HttpError(400, "Set a forwarding number first");
      db.prepare(
        "UPDATE users SET forward_to = ?, forwarding_enabled = ?, do_not_disturb = ? WHERE id = ?",
      ).run(forwardTo, forwarding ? 1 : 0, (s.doNotDisturb ?? Boolean(user.do_not_disturb)) ? 1 : 0, id);
      res.json(publicUser(requireUser(db, id)));
    }),
  );

  /** Store-required in-app account deletion. Re-confirms the password. */
  r.delete(
    "/",
    handle(async (req, res) => {
      const userId = userIdOf(req);
      const { password } = z.object({ password: z.string().min(1).max(200) }).parse(req.body);
      if (!(await verifyPassword(password, requireUser(db, userId).password_hash))) {
        throw new HttpError(403, "Incorrect password");
      }
      await deleteAccount(deps, userId);
      res.status(204).end();
    }),
  );

  r.put(
    "/push-token",
    handle((req, res) => {
      const { token } = z.object({ token: z.string().min(1).max(500).nullable() }).parse(req.body);
      db.prepare("UPDATE users SET push_token = ? WHERE id = ?").run(token, userIdOf(req));
      res.status(204).end();
    }),
  );

  return r;
}
