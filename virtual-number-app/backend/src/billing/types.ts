import type { PlanId } from "../plans.js";

export interface PlanState {
  plan: PlanId;
  /**
   * When paid access ends (including the store's billing grace period), or
   * ended, for a lapsed user on the free plan. Null if the user never paid or
   * has a non-expiring entitlement.
   */
  expiresAt: string | null;
}

export interface BillingProvider {
  /** Fetches the authoritative subscription state for one of our user ids. */
  fetchPlan(userId: string): Promise<PlanState>;
  /** Checks that a billing webhook really came from the billing service. */
  verifyWebhook(authorization: string | undefined): boolean;
}
