import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/api";
import { formatPhone } from "@/format";
import { useLiveQuery } from "@/hooks";
import { showPaywallFor } from "@/subscription";
import { colors, spacing } from "@/theme";
import type { Message } from "@/types";
import { ErrorText } from "@/ui";

export default function Chat() {
  const { id, to } = useLocalSearchParams<{ id: string; to: string }>();
  const insets = useSafeAreaInsets();
  const thread = useLiveQuery(useCallback(() => api.thread(id, to), [id, to]), 5_000);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const message = await api.sendSms(id, to, body);
      thread.setData((prev) => [...(prev ?? []), message]);
      setDraft("");
    } catch (err) {
      if (showPaywallFor(err)) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const messages = [...(thread.data ?? [])].reverse();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: formatPhone(to),
          headerRight: () => (
            <Pressable
              hitSlop={12}
              accessibilityLabel="Call"
              onPress={() => router.push({ pathname: "/number/[id]/dial", params: { id, to } })}
            >
              <Ionicons name="call-outline" size={22} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing(4), gap: spacing(2) }}
        renderItem={({ item }) => <Bubble message={item} />}
      />
      <View style={{ paddingHorizontal: spacing(4) }}>
        <ErrorText>{error ?? thread.error}</ErrorText>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: spacing(2),
          padding: spacing(3),
          paddingBottom: Math.max(insets.bottom, spacing(3)),
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Text message"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={1600}
          style={{
            flex: 1,
            maxHeight: 120,
            minHeight: 40,
            borderRadius: 20,
            paddingHorizontal: spacing(4),
            paddingTop: spacing(2.5),
            paddingBottom: spacing(2.5),
            backgroundColor: colors.background,
            fontSize: 16,
            color: colors.text,
          }}
        />
        <Pressable
          onPress={send}
          disabled={sending || !draft.trim()}
          accessibilityLabel="Send"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: draft.trim() ? colors.primary : colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="arrow-up" size={22} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message }: { message: Message }) {
  const out = message.direction === "outbound";
  const failed = message.status === "failed" || message.status === "undelivered";
  return (
    <View style={{ alignItems: out ? "flex-end" : "flex-start" }}>
      <View
        style={{
          maxWidth: "80%",
          paddingHorizontal: spacing(3.5),
          paddingVertical: spacing(2.5),
          borderRadius: 18,
          borderBottomRightRadius: out ? 4 : 18,
          borderBottomLeftRadius: out ? 18 : 4,
          backgroundColor: out ? colors.bubbleOut : colors.bubbleIn,
        }}
      >
        <Text selectable style={{ fontSize: 16, color: out ? "#fff" : colors.text }}>
          {message.body}
        </Text>
      </View>
      {failed && <Text style={{ color: colors.danger, fontSize: 12, marginTop: 2 }}>Not delivered</Text>}
    </View>
  );
}
