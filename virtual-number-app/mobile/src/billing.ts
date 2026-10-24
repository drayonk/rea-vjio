import { Platform } from "react-native";
import Purchases, {
  INTRO_ELIGIBILITY_STATUS,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from "react-native-purchases";
import type { PlanId } from "./types";

const apiKey = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

/** False until RevenueCat public keys are set (see .env.example). */
export const billingAvailable = Boolean(apiKey) && Platform.OS !== "web";

let ready: Promise<void> | null = null;

/** Lets a build bypass payment. Always null for real builds; the demo build replaces this module. */
export const skipPaywall: { label: string; run: () => Promise<void> } | null = null;

/** Ties store purchases to our user id, which the backend uses to look them up. */
export function identify(userId: string): Promise<void> {
  if (!billingAvailable) return Promise.resolve();
  ready = ready
    ? ready.then(() => Purchases.logIn(userId)).then(() => {})
    : Promise.resolve(Purchases.configure({ apiKey: apiKey!, appUserID: userId }));
  return ready;
}

export async function reset() {
  if (!ready) return;
  // logOut rejects when the current user is already anonymous; nothing to undo then.
  ready = ready.then(() => Purchases.logOut()).then(
    () => {},
    () => {},
  );
  await ready;
}

async function configured() {
  if (!ready) throw new Error("Subscriptions are not available on this device.");
  await ready;
}

export interface PaywallOption {
  pkg: PurchasesPackage;
  plan: Exclude<PlanId, "free">;
  period: "week" | "month" | "year" | "other";
  priceString: string;
  /** e.g. "3-day free trial", only when this user is eligible. */
  trial: string | null;
  /** Saving versus paying monthly for a year, for yearly options. */
  savePercent: number | null;
}

/**
 * Store products must be named secondline_<plan>_<period>, e.g.
 * secondline_pro_annual. The backend still decides the plan from
 * RevenueCat entitlements; this only groups options on the paywall.
 */
export const planOfProduct = (productId: string): PaywallOption["plan"] =>
  /(^|[._-])pro([._-]|$)/.test(productId) ? "pro" : "premium";

const PERIODS: Record<string, PaywallOption["period"]> = { P1W: "week", P7D: "week", P1M: "month", P1Y: "year", P12M: "year" };
const MONTHS_PER: Record<PaywallOption["period"], number> = { week: 12 / 52, month: 1, year: 12, other: 1 };

function unitLabel(count: number, unit: string) {
  const u = unit.toLowerCase();
  return `${count}-${u === "unknown" ? "period" : u}`;
}

function trialOf(product: PurchasesStoreProduct, eligible: boolean): string | null {
  const androidFree = product.defaultOption?.freePhase;
  if (androidFree) return `${unitLabel(androidFree.billingPeriod.value, androidFree.billingPeriod.unit)} free trial`;
  const intro = product.introPrice;
  if (eligible && intro && intro.price === 0) {
    return `${unitLabel(intro.periodNumberOfUnits * Math.max(1, intro.cycles), intro.periodUnit)} free trial`;
  }
  return null;
}

export async function loadPaywall(): Promise<PaywallOption[]> {
  await configured();
  const offering = (await Purchases.getOfferings()).current;
  const packages = offering?.availablePackages ?? [];
  // On Android, defaultOption already reflects eligibility; iOS needs a check.
  const eligibility =
    Platform.OS === "ios" && packages.length > 0
      ? await Purchases.checkTrialOrIntroductoryPriceEligibility(packages.map((p) => p.product.identifier))
      : {};
  const options = packages.map((pkg): PaywallOption => {
    const product = pkg.product;
    const status = eligibility[product.identifier]?.status;
    return {
      pkg,
      plan: planOfProduct(product.identifier),
      period: PERIODS[product.subscriptionPeriod ?? ""] ?? "other",
      priceString: product.priceString,
      trial: trialOf(product, status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE),
      savePercent: null,
    };
  });
  for (const o of options) {
    const monthly = options.find((m) => m.plan === o.plan && m.period === "month");
    if (o.period === "year" && monthly) {
      const yearlyAtMonthly = monthly.pkg.product.price * 12;
      const save = Math.round((1 - o.pkg.product.price / yearlyAtMonthly) * 100);
      o.savePercent = save > 0 ? save : null;
    }
  }
  return options.sort((a, b) => MONTHS_PER[a.period] - MONTHS_PER[b.period]);
}

/** Resolves false when the user cancels the store sheet. */
export async function purchase(option: PaywallOption): Promise<boolean> {
  await configured();
  // Google Play keeps an existing subscription running alongside a new one
  // unless the purchase names the one it replaces. iOS does this itself for
  // products in the same subscription group.
  const productId = (id: string) => id.split(":")[0]!;
  const current =
    Platform.OS === "android"
      ? (await Purchases.getCustomerInfo()).activeSubscriptions
          .map(productId)
          .find((id) => id !== productId(option.pkg.product.identifier))
      : undefined;
  try {
    await Purchases.purchasePackage(option.pkg, null, current ? { oldProductIdentifier: current } : null);
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return false;
    throw err;
  }
}

export async function restore() {
  await configured();
  await Purchases.restorePurchases();
}

/** Store page where the user can cancel or change their subscription. */
export async function managementUrl(): Promise<string | null> {
  if (!ready) return null;
  await ready;
  return (await Purchases.getCustomerInfo()).managementURL;
}
