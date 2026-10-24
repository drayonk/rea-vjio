import type { Db } from "./db.js";
import type { UserRow } from "./repo.js";
import { PLANS, type PlanId, type PlanLimits } from "./plan-limits.js";

export { PLANS, type PlanId, type PlanLimits };

/** Entitlement identifiers configured in RevenueCat, best first. */
export const ENTITLEMENT_PLANS: ReadonlyArray<readonly [entitlement: string, plan: PlanId]> = [
  ["pro", "pro"],
  ["premium", "premium"],
];

/** Usage is metered over a rolling window rather than store billing periods. */
export const USAGE_WINDOW_DAYS = 30;

export interface Usage {
  numbers: number;
  sms: number;
  minutes: number;
}

/**
 * The plan a user may use right now. A stored paid plan whose expiry has
 * passed counts as free even if the expiration webhook never arrived.
 */
export function effectivePlan(user: UserRow, paywallEnabled: boolean, at = new Date()): PlanId {
  if (!paywallEnabled) return "pro";
  if (user.plan === "free") return "free";
  return user.plan_expires_at && new Date(user.plan_expires_at) <= at ? "free" : user.plan;
}

export function usage(db: Db, userId: string, at = new Date()): Usage {
  const since = new Date(at.getTime() - USAGE_WINDOW_DAYS * 86_400_000).toISOString();
  const { numbers } = db
    .prepare("SELECT COUNT(*) AS numbers FROM numbers WHERE user_id = ? AND released_at IS NULL")
    .get(userId) as { numbers: number };
  const { sms } = db
    .prepare(
      `SELECT COUNT(*) AS sms FROM messages m JOIN numbers n ON n.id = m.number_id
       WHERE n.user_id = ? AND m.direction = 'outbound' AND m.created_at >= ?`,
    )
    .get(userId, since) as { sms: number };
  // Bridged outbound calls and forwarded inbound calls both use carrier minutes.
  const { seconds } = db
    .prepare(
      `SELECT COALESCE(SUM(c.duration_seconds), 0) AS seconds FROM calls c JOIN numbers n ON n.id = c.number_id
       WHERE n.user_id = ? AND c.created_at >= ?`,
    )
    .get(userId, since) as { seconds: number };
  return { numbers, sms, minutes: Math.ceil(seconds / 60) };
}
