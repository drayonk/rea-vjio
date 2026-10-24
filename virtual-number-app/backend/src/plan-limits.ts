// Dependency-free so the mobile demo build can share these exact limits.

export type PlanId = "free" | "premium" | "pro";

export interface PlanLimits {
  numbers: number;
  smsPerMonth: number;
  minutesPerMonth: number;
}

/** The single source of plan limits; the app renders these too. */
export const PLANS: Record<PlanId, PlanLimits> = {
  free: { numbers: 0, smsPerMonth: 0, minutesPerMonth: 0 },
  premium: { numbers: 1, smsPerMonth: 1000, minutesPerMonth: 300 },
  pro: { numbers: 3, smsPerMonth: 3000, minutesPerMonth: 1000 },
};
