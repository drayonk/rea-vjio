import type { Deps } from "./app.js";
import { now } from "./db.js";

/**
 * Permanently deletes a user. Carrier numbers are released first and each
 * release is recorded as it succeeds, so a failure part-way leaves the
 * account in place (still owning whatever wasn't released) and a retry
 * continues where it stopped. Nothing is erased until every number is gone.
 */
export async function deleteAccount(deps: Pick<Deps, "db" | "telephony" | "billing">, userId: string) {
  const { db, telephony, billing } = deps;
  const active = db
    .prepare("SELECT id, provider_sid FROM numbers WHERE user_id = ? AND released_at IS NULL")
    .all(userId) as Array<{ id: string; provider_sid: string }>;
  for (const n of active) {
    await telephony.release(n.provider_sid);
    db.prepare("UPDATE numbers SET released_at = ? WHERE id = ?").run(now(), n.id);
  }
  await billing?.deleteCustomer(userId);

  db.exec("BEGIN");
  try {
    const owned = "SELECT id FROM numbers WHERE user_id = ?";
    db.prepare(`DELETE FROM messages WHERE number_id IN (${owned})`).run(userId);
    db.prepare(`DELETE FROM calls WHERE number_id IN (${owned})`).run(userId);
    db.prepare("DELETE FROM numbers WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
