import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { hashPassword, issueToken, verifyPassword } from "../auth.js";
import { now } from "../db.js";
import type { Deps } from "../app.js";
import { publicUser, type UserRow } from "../repo.js";
import { HttpError, handle } from "../validation.js";

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export function authRoutes({ db, config }: Deps) {
  const r = Router();

  r.post(
    "/register",
    handle(async (req, res) => {
      const { email, password } = credentials.parse(req.body);
      if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
        throw new HttpError(409, "An account with this email already exists");
      }
      const id = randomUUID();
      db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
        id,
        email,
        await hashPassword(password),
        now(),
      );
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as UserRow;
      res.status(201).json({ token: issueToken(id, config.authSecret), user: publicUser(user) });
    }),
  );

  r.post(
    "/login",
    handle(async (req, res) => {
      const { email, password } = credentials.parse(req.body);
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        throw new HttpError(401, "Incorrect email or password");
      }
      res.json({ token: issueToken(user.id, config.authSecret), user: publicUser(user) });
    }),
  );

  return r;
}
