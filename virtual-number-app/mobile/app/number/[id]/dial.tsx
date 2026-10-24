import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { api } from "@/api";
import { countryByCode } from "@/countries";
import { formatPhone, toE164 } from "@/format";
import { useLiveQuery } from "@/hooks";
import { useSession } from "@/session";
import { showPaywallFor } from "@/subscription";
import { colors, spacing } from "@/theme";
import { ErrorText } from "@/ui";

const KEYS = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["+", ""],
  ["0", ""],
  ["⌫", ""],
] as const;

export default function Dial() {
  const params = useLocalSearchParams<{ id: string; to?: string }>();
  const { user } = useSession();
  const numbers = useLiveQuery(api.myNumbers, 60_000);
  const number = numbers.data?.find((n) => n.id === params.id);
  const [input, setInput] = useState(params.to ?? "");
  const [error, setError] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);

  const press = (key: string) => {
    setError(null);
    if (key === "⌫") setInput((s) => s.slice(0, -1));
    else if (key === "+") setInput((s) => (s.startsWith("+") ? s : `+${s}`));
    else setInput((s) => (s.length < 16 ? s + key : s));
  };

  const call = async () => {
    if (number && !number.callsEnabled) {
      setError("Calls are turned off for this number. Turn them on from the number's menu.");
      return;
    }
    const to = toE164(input, countryByCode(number?.country ?? "US").dial);
    if (!to) {
      setError("Enter a valid phone number");
      return;
    }
    if (!user?.forwardTo) {
      Alert.alert("Add your phone first", "We connect calls through your real phone. Add it in Settings.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => router.replace("/settings") },
      ]);
      return;
    }
    setCalling(true);
    try {
      await api.placeCall(params.id, to);
      Alert.alert(
        "Calling your phone…",
        `Answer the call on ${formatPhone(user.forwardTo)} and we'll connect you to ${formatPhone(to)}. They'll see ${number ? formatPhone(number.e164) : "your virtual number"}.`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (err) {
      if (showPaywallFor(err)) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCalling(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: spacing(6), justifyContent: "space-between" }}>
      <View style={{ alignItems: "center", gap: spacing(2), minHeight: 90 }}>
        <Text style={{ color: colors.muted }}>{number ? `Calling from ${formatPhone(number.e164)}` : ""}</Text>
        <Text style={{ fontSize: 32, fontWeight: "600", color: colors.text }} numberOfLines={1} adjustsFontSizeToFit>
          {input || " "}
        </Text>
        <ErrorText>{error}</ErrorText>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing(4) }}>
        {KEYS.map(([key, letters]) => (
          <Pressable
            key={key}
            onPress={() => press(key)}
            onLongPress={key === "⌫" ? () => setInput("") : key === "0" ? () => press("+") : undefined}
            accessibilityLabel={key === "⌫" ? "Delete" : key}
            style={({ pressed }) => ({
              width: "30%",
              aspectRatio: 1.4,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? colors.border : key === "⌫" ? "transparent" : colors.card,
            })}
          >
            <Text style={{ fontSize: 28, color: colors.text }}>{key}</Text>
            {letters ? <Text style={{ fontSize: 10, color: colors.muted, letterSpacing: 2 }}>{letters}</Text> : null}
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={call}
        disabled={calling || !input}
        accessibilityLabel="Place call"
        style={{
          alignSelf: "center",
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: colors.success,
          alignItems: "center",
          justifyContent: "center",
          opacity: calling || !input ? 0.5 : 1,
        }}
      >
        <Ionicons name="call" size={32} color="#fff" />
      </Pressable>
    </View>
  );
}
