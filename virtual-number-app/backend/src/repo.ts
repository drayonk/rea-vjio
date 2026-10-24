import type { Db } from "./db.js";
import { HttpError } from "./validation.js";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  forward_to: string | null;
  forwarding_enabled: number;
  do_not_disturb: number;
  push_token: string | null;
  plan: "free" | "premium" | "pro";
  plan_expires_at: string | null;
}

export interface NumberRow {
  id: string;
  user_id: string;
  provider_sid: string;
  e164: string;
  country: string;
  locality: string | null;
  label: string | null;
  sms: number;
  voice: number;
  created_at: string;
}

export const getUser = (db: Db, id: string) =>
  db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;

export function requireUser(db: Db, id: string): UserRow {
  const user = getUser(db, id);
  if (!user) throw new HttpError(404, "user not found");
  return user;
}

export function ownedNumber(db: Db, userId: string, numberId: string): NumberRow {
  const row = db
    .prepare("SELECT * FROM numbers WHERE id = ? AND user_id = ? AND released_at IS NULL")
    .get(numberId, userId) as NumberRow | undefined;
  if (!row) throw new HttpError(404, "number not found");
  return row;
}

export const activeNumberByE164 = (db: Db, e164: string) =>
  db.prepare("SELECT * FROM numbers WHERE e164 = ? AND released_at IS NULL").get(e164) as NumberRow | undefined;

export const publicNumber = (n: NumberRow) => ({
  id: n.id,
  e164: n.e164,
  country: n.country,
  locality: n.locality,
  label: n.label,
  sms: Boolean(n.sms),
  voice: Boolean(n.voice),
  createdAt: n.created_at,
});

export const publicUser = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  forwardTo: u.forward_to,
  forwardingEnabled: Boolean(u.forwarding_enabled),
  doNotDisturb: Boolean(u.do_not_disturb),
});
