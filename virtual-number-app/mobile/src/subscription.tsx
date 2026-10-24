import { router } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, api } from "./api";
import * as billing from "./billing";
import { useSession } from "./session";
import type { Subscription } from "./types";

interface SubscriptionValue {
  subscription: Subscription | null;
  refresh: () => Promise<Subscription | null>;
  /** Asks the server to re-read the store; use after a purchase or restore. */
  sync: () => Promise<Subscription>;
}

const SubscriptionContext = createContext<SubscriptionValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.subscription();
      setSubscription(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  const sync = useCallback(async () => {
    const next = await api.refreshSubscription();
    setSubscription(next);
    return next;
  }, []);

  useEffect(() => {
    if (user) {
      void billing.identify(user.id).catch((err) => console.warn("billing setup failed", err));
      void refresh();
    } else {
      setSubscription(null);
      void billing.reset();
    }
  }, [user, refresh]);

  const value = useMemo(() => ({ subscription, refresh, sync }), [subscription, refresh, sync]);
  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const value = useContext(SubscriptionContext);
  if (!value) throw new Error("useSubscription must be used inside SubscriptionProvider");
  return value;
}

/** Opens the paywall when the server says the plan doesn't allow an action. */
export function showPaywallFor(err: unknown): boolean {
  if (err instanceof ApiError && err.code === "upgrade_required") {
    router.push({ pathname: "/paywall", params: { reason: err.message } });
    return true;
  }
  return false;
}

export const PLAN_NAMES = { free: "Free", premium: "Premium", pro: "Pro" } as const;
