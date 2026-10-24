import { timingSafeEqual } from "node:crypto";
import { ENTITLEMENT_PLANS } from "../plans.js";
import { ProviderError } from "../telephony/types.js";
import type { BillingProvider, PlanState } from "./types.js";

interface RevenueCatEntitlement {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
}

/**
 * Reads entitlements from RevenueCat's REST API. The mobile app logs in to
 * RevenueCat with our user id, so the app user id and our id are the same.
 */
export class RevenueCatBilling implements BillingProvider {
  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
  ) {}

  async fetchPlan(userId: string): Promise<PlanState> {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: { authorization: `Bearer ${this.secretKey}` },
    });
    if (!res.ok) throw new ProviderError(`RevenueCat lookup failed (${res.status})`, res.status);
    const body = (await res.json()) as { subscriber: { entitlements: Record<string, RevenueCatEntitlement> } };
    return planFromEntitlements(body.subscriber.entitlements, new Date());
  }

  verifyWebhook(authorization: string | undefined): boolean {
    const expected = Buffer.from(`Bearer ${this.webhookSecret}`);
    const actual = Buffer.from(authorization ?? "");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}

export function planFromEntitlements(entitlements: Record<string, RevenueCatEntitlement>, at: Date): PlanState {
  let lastEnded: Date | null = null;
  for (const [entitlement, plan] of ENTITLEMENT_PLANS) {
    const e = entitlements[entitlement];
    if (!e) continue;
    if (e.expires_date === null) return { plan, expiresAt: null };
    const end = [e.expires_date, e.grace_period_expires_date ?? e.expires_date]
      .map((d) => new Date(d))
      .reduce((a, b) => (a > b ? a : b));
    if (end > at) return { plan, expiresAt: end.toISOString() };
    if (!lastEnded || end > lastEnded) lastEnded = end;
  }
  return { plan: "free", expiresAt: lastEnded?.toISOString() ?? null };
}
