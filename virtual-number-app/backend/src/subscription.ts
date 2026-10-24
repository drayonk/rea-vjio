import type { Deps } from "./app.js";
import { now } from "./db.js";
import { PLANS, effectivePlan, usage, type PlanId, type PlanLimits, type Usage } from "./plans.js";
import { requireUser, type UserRow } from "./repo.js";
import { upgradeRequired } from "./validation.js";

type SubscriptionDeps = Pick<Deps, "db" | "billing" | "config" | "telephony">;

export interface Entitlement {
  user: UserRow;
  plan: PlanId;
  limits: PlanLimits;
  usage: Usage;
}

export function entitlement({ db, billing }: SubscriptionDeps, userId: string): Entitlement {
  const user = requireUser(db, userId);
  const plan = effectivePlan(user, billing !== null);
  return { user, plan, limits: PLANS[plan], usage: usage(db, userId) };
}

const LAPSED = "Your subscription has ended. Renew to keep using your numbers.";

/** Throws a 402 (shown as the paywall) when the plan does not allow the action. */
export function assertAllowed(deps: SubscriptionDeps, userId: string, action: "number" | "sms" | "call") {
  const { plan, limits, usage } = entitlement(deps, userId);
  if (action === "number") {
    if (usage.numbers >= limits.numbers) {
      throw upgradeRequired(
        plan === "free"
          ? "Subscribe to get your second number."
          : `Your plan includes ${limits.numbers} number${limits.numbers === 1 ? "" : "s"}. Upgrade to add more.`,
      );
    }
  } else if (plan === "free") {
    throw upgradeRequired(LAPSED);
  } else if (action === "sms" && usage.sms >= limits.smsPerMonth) {
    throw upgradeRequired(`You've used all ${limits.smsPerMonth} texts in the last 30 days. Upgrade for more.`);
  } else if (action === "call" && usage.minutes >= limits.minutesPerMonth) {
    throw upgradeRequired(`You've used all ${limits.minutesPerMonth} call minutes in the last 30 days. Upgrade for more.`);
  }
}

/** Whether an inbound call may ring through to the user's real phone. */
export function mayForwardCalls(deps: SubscriptionDeps, userId: string): boolean {
  const { plan, limits, usage } = entitlement(deps, userId);
  return plan !== "free" && usage.minutes < limits.minutesPerMonth;
}

/** Pulls the latest state from the billing service into our database. */
export async function syncPlan({ db, billing }: SubscriptionDeps, userId: string) {
  if (!billing) return;
  const state = await billing.fetchPlan(userId);
  db.prepare("UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?").run(state.plan, state.expiresAt, userId);
}

/** When a lapsed user's numbers will be released, or null if they won't be. */
function releaseAt(user: UserRow, plan: PlanId, numbers: number, graceDays: number): string | null {
  if (plan !== "free" || numbers === 0 || !user.plan_expires_at) return null;
  return new Date(new Date(user.plan_expires_at).getTime() + graceDays * 86_400_000).toISOString();
}

export function subscriptionView(deps: SubscriptionDeps, userId: string) {
  const { user, plan, limits, usage } = entitlement(deps, userId);
  return {
    paywallEnabled: deps.billing !== null,
    plan,
    expiresAt: plan === "free" ? null : user.plan_expires_at,
    releaseAt: releaseAt(user, plan, usage.numbers, deps.config.lapsedReleaseDays),
    limits,
    usage,
    plans: { premium: PLANS.premium, pro: PLANS.pro },
  };
}

/**
 * Releases numbers whose owner's subscription lapsed more than the grace
 * period ago, so the carrier stops billing for them. A failed release is kept
 * and retried on the next run.
 */
export async function releaseLapsedNumbers(deps: SubscriptionDeps, at = new Date()) {
  if (!deps.billing) return 0;
  const cutoff = new Date(at.getTime() - deps.config.lapsedReleaseDays * 86_400_000).toISOString();
  const lapsed = deps.db
    .prepare(
      `SELECT n.id, n.provider_sid FROM numbers n JOIN users u ON u.id = n.user_id
       WHERE n.released_at IS NULL AND u.plan_expires_at IS NOT NULL AND u.plan_expires_at < ?`,
    )
    .all(cutoff) as Array<{ id: string; provider_sid: string }>;
  let released = 0;
  for (const n of lapsed) {
    try {
      await deps.telephony.release(n.provider_sid);
      deps.db.prepare("UPDATE numbers SET released_at = ? WHERE id = ?").run(now(), n.id);
      released++;
    } catch (err) {
      console.warn(`release of lapsed number ${n.id} failed; will retry`, err);
    }
  }
  return released;
}
