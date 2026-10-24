import type { Config } from "../config.js";
import { RevenueCatBilling } from "./revenuecat.js";
import type { BillingProvider } from "./types.js";

/** Returns null when the paywall is off and every user gets the top plan. */
export function createBilling(config: Config): BillingProvider | null {
  return config.billingProvider === "revenuecat"
    ? new RevenueCatBilling(config.revenuecatSecretKey, config.revenuecatWebhookSecret)
    : null;
}
