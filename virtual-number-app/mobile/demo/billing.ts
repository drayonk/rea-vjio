// Demo replacement for src/billing.ts: a fake store with the same exports.
import "./setup";
import type { PaywallOption as RealOption } from "../src/billing";
import { grantPlan } from "./fake-api";

export type PaywallOption = RealOption;
export const billingAvailable = true;

let userId: string | null = null;

export async function identify(id: string) {
  userId = id;
}
export async function reset() {
  userId = null;
}

const option = (
  id: string,
  plan: PaywallOption["plan"],
  period: PaywallOption["period"],
  price: number,
  trial: string | null,
  savePercent: number | null,
): PaywallOption => ({
  // Only the fields the paywall reads; the real type is the store SDK's package.
  pkg: { identifier: id, product: { identifier: id, title: id, price } } as unknown as PaywallOption["pkg"],
  plan,
  period,
  priceString: `$${price.toFixed(2)}`,
  trial,
  savePercent,
});

export async function loadPaywall(): Promise<PaywallOption[]> {
  return [
    option("secondline_premium_monthly", "premium", "month", 7.99, null, null),
    option("secondline_premium_annual", "premium", "year", 59.99, "3-day free trial", 37),
    option("secondline_pro_monthly", "pro", "month", 14.99, null, null),
    option("secondline_pro_annual", "pro", "year", 119.99, "3-day free trial", 33),
  ];
}

/** Instant fake purchase: nothing is charged. */
export async function purchase(o: PaywallOption) {
  if (userId) grantPlan(userId, o.plan);
  return true;
}
export async function restore() {}
export async function managementUrl() {
  return null;
}

export const skipPaywall = {
  label: "Skip paywall (demo)",
  run: async () => {
    if (userId) grantPlan(userId, "pro");
  },
};
