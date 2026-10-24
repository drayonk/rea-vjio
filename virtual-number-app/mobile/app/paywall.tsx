import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as billing from "@/billing";
import { PLAN_NAMES, useSubscription } from "@/subscription";
import { colors, spacing } from "@/theme";
import type { PlanLimits } from "@/types";
import { Button, ErrorText, styles, type IconName } from "@/ui";

const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL;
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL;
const PERIOD_NAMES = { week: "Weekly", month: "Monthly", year: "Yearly", other: "" } as const;
const PER = { week: "/week", month: "/month", year: "/year", other: "" } as const;

/** The backend reports success before RevenueCat has seen the receipt; retry briefly. */
async function waitForPlan(sync: () => Promise<{ plan: string }>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await sync()).plan !== "free") return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

export default function Paywall() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const insets = useSafeAreaInsets();
  const { subscription, sync } = useSubscription();
  const [options, setOptions] = useState<billing.PaywallOption[] | null>(null);
  const [plan, setPlan] = useState<"premium" | "pro">(subscription?.plan === "premium" ? "pro" : "premium");
  const [selected, setSelected] = useState<billing.PaywallOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);

  useEffect(() => {
    if (!billing.billingAvailable) {
      setError("Subscriptions aren't set up in this build yet.");
      setOptions([]);
      return;
    }
    billing.loadPaywall().then(setOptions, (err) => {
      setError(err instanceof Error ? err.message : String(err));
      setOptions([]);
    });
  }, []);

  const visible = useMemo(() => (options ?? []).filter((o) => o.plan === plan), [options, plan]);
  useEffect(() => {
    // Default to the yearly option when there is one: best value, best retention.
    setSelected(visible.find((o) => o.period === "year") ?? visible[0] ?? null);
  }, [visible]);

  const finish = async (purchased: boolean) => {
    if (!purchased) return;
    if (await waitForPlan(sync)) {
      router.back();
    } else {
      Alert.alert("Almost there", "Your purchase went through. It can take a minute to activate — pull to refresh shortly.");
      router.back();
    }
  };

  const buy = async () => {
    if (!selected) return;
    setBusy("buy");
    setError(null);
    try {
      await finish(await billing.purchase(selected));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy("restore");
    setError(null);
    try {
      await billing.restore();
      if (await waitForPlan(sync)) router.back();
      else setError("No active subscription was found for this store account.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const limits: PlanLimits | undefined = subscription?.plans[plan];
  const isCurrent = subscription?.plan === plan;
  const store = Platform.OS === "ios" ? "Apple ID" : "Google Play account";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing(5), gap: spacing(4), paddingBottom: spacing(4) }}>
        <View style={{ alignItems: "center", gap: spacing(2) }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: colors.text, textAlign: "center" }}>
            Your private second number
          </Text>
          <Text style={[styles.subtitle, { textAlign: "center" }]}>
            {reason ?? "Call and text from a real number without giving out your own."}
          </Text>
        </View>

        <View style={{ flexDirection: "row", backgroundColor: colors.border, borderRadius: 12, padding: 3 }}>
          {(["premium", "pro"] as const).map((p) => (
            <Pressable
              key={p}
              onPress={() => setPlan(p)}
              style={{ flex: 1, paddingVertical: spacing(2), borderRadius: 10, alignItems: "center", backgroundColor: plan === p ? colors.card : "transparent" }}
            >
              <Text style={{ fontWeight: "700", color: plan === p ? colors.text : colors.muted }}>{PLAN_NAMES[p]}</Text>
            </Pressable>
          ))}
        </View>

        {options === null ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={{ gap: spacing(3) }}>
            {visible.map((o) => {
              const active = selected?.pkg.identifier === o.pkg.identifier;
              return (
                <Pressable
                  key={o.pkg.identifier}
                  onPress={() => setSelected(o)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(3),
                    padding: spacing(4),
                    borderRadius: 16,
                    borderWidth: 2,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primarySoft : colors.card,
                  }}
                >
                  <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={22} color={active ? colors.primary : colors.muted} />
                  <View style={{ flex: 1, gap: spacing(0.5) }}>
                    <Text style={styles.title}>{PERIOD_NAMES[o.period] || o.pkg.product.title}</Text>
                    {o.trial && <Text style={{ color: colors.success, fontWeight: "600" }}>{o.trial}</Text>}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: spacing(0.5) }}>
                    <Text style={styles.title}>
                      {o.priceString}
                      <Text style={styles.subtitle}>{PER[o.period]}</Text>
                    </Text>
                    {o.savePercent && (
                      <View style={{ backgroundColor: colors.success, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Save {o.savePercent}%</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        {limits && (
          <View style={{ gap: spacing(3) }}>
            <Benefit icon="call" text={`${limits.numbers} phone number${limits.numbers === 1 ? "" : "s"} of your choice`} />
            <Benefit icon="chatbubbles" text={`${limits.smsPerMonth.toLocaleString()} texts a month`} />
            <Benefit icon="time" text={`${limits.minutesPerMonth.toLocaleString()} call minutes a month`} />
            <Benefit icon="recording" text="Voicemail, call forwarding and Do Not Disturb" />
            <Benefit icon="eye-off" text="Your real number stays private" />
          </View>
        )}

        <ErrorText>{error}</ErrorText>
      </ScrollView>

      <View style={{ padding: spacing(5), paddingBottom: Math.max(insets.bottom, spacing(5)), gap: spacing(3), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
        <Button
          title={isCurrent ? "Your current plan" : selected?.trial ? "Start free trial" : "Subscribe"}
          onPress={buy}
          loading={busy === "buy"}
          disabled={!selected || isCurrent || busy !== null}
        />
        <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center" }}>
          {selected?.trial
            ? `Free for the trial period, then ${selected.priceString}${PER[selected.period]}. `
            : selected
              ? `${selected.priceString}${PER[selected.period]}. `
              : ""}
          Payment is charged to your {store}. The subscription renews automatically unless cancelled at least 24 hours
          before the end of the current period. Manage or cancel any time in your account settings.
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: spacing(5) }}>
          <Link title="Restore purchases" onPress={restore} disabled={busy !== null} />
          {TERMS_URL && <Link title="Terms" onPress={() => void Linking.openURL(TERMS_URL)} />}
          {PRIVACY_URL && <Link title="Privacy" onPress={() => void Linking.openURL(PRIVACY_URL)} />}
        </View>
      </View>
    </View>
  );
}

function Benefit({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={{ fontSize: 16, color: colors.text, flex: 1 }}>{text}</Text>
    </View>
  );
}

function Link(props: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={props.onPress} disabled={props.disabled} hitSlop={8}>
      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600", opacity: props.disabled ? 0.5 : 1 }}>
        {props.title}
      </Text>
    </Pressable>
  );
}
