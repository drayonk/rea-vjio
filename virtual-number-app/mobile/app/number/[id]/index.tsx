import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Clipboard from "expo-clipboard";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, FlatList, Modal, Pressable, RefreshControl, Text, View } from "react-native";
import { api } from "@/api";
import { duration, formatPhone, timeAgo } from "@/format";
import { useLiveQuery } from "@/hooks";
import { colors, spacing } from "@/theme";
import type { Call } from "@/types";
import { Avatar, Button, Card, EmptyState, ErrorText, Field, styles } from "@/ui";

type Tab = "messages" | "calls";

export default function NumberDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("messages");
  const [renaming, setRenaming] = useState(false);
  const numbers = useLiveQuery(api.myNumbers, 60_000);
  const number = numbers.data?.find((n) => n.id === id);
  const conversations = useLiveQuery(useCallback(() => api.conversations(id), [id]));
  const calls = useLiveQuery(useCallback(() => api.calls(id), [id]));

  const manage = () =>
    Alert.alert(number ? formatPhone(number.e164) : "Number", undefined, [
      { text: "Copy number", onPress: () => number && void Clipboard.setStringAsync(number.e164) },
      { text: "Rename", onPress: () => setRenaming(true) },
      ...(number?.voice
        ? [
            {
              text: number.callsEnabled ? "Turn off calls" : "Turn on calls",
              onPress: () =>
                number.callsEnabled
                  ? Alert.alert(
                      "Turn off calls?",
                      "This number becomes texts only. Callers hear a busy signal, no voicemail is taken, and you can't call out from it.",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Turn off", style: "destructive", onPress: () => void setCalls(false) },
                      ],
                    )
                  : void setCalls(true),
            },
          ]
        : []),
      {
        text: "Release number",
        style: "destructive",
        onPress: () =>
          Alert.alert(
            "Release this number?",
            "You'll stop receiving calls and texts on it, and it may be given to someone else.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Release",
                style: "destructive",
                onPress: async () => {
                  try {
                    await api.releaseNumber(id);
                    router.back();
                  } catch (err) {
                    Alert.alert("Couldn't release", err instanceof Error ? err.message : String(err));
                  }
                },
              },
            ],
          ),
      },
      { text: "Cancel", style: "cancel" },
    ]);

  const active = tab === "messages" ? conversations : calls;
  const callsOn = Boolean(number?.voice && number.callsEnabled);

  const setCalls = async (callsEnabled: boolean) => {
    try {
      await api.updateNumber(id, { callsEnabled });
      void numbers.refresh();
    } catch (err) {
      Alert.alert("Couldn't update", err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: number ? formatPhone(number.e164) : "",
          headerRight: () => (
            <Pressable onPress={manage} hitSlop={12} accessibilityLabel="Manage number">
              <Ionicons name="ellipsis-horizontal-circle" size={26} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <RenameModal
        visible={renaming}
        initial={number?.label ?? ""}
        onClose={() => setRenaming(false)}
        onSave={async (label) => {
          await api.updateNumber(id, { label: label || null });
          setRenaming(false);
          void numbers.refresh();
        }}
      />
      <View style={{ flexDirection: "row", margin: spacing(4), backgroundColor: colors.border, borderRadius: 12, padding: 3 }}>
        {(["messages", "calls"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => {
              setTab(t);
              void (t === "messages" ? conversations : calls).refresh();
            }}
            style={{
              flex: 1,
              paddingVertical: spacing(2),
              borderRadius: 10,
              alignItems: "center",
              backgroundColor: tab === t ? colors.card : "transparent",
            }}
          >
            <Text style={{ fontWeight: "600", color: tab === t ? colors.text : colors.muted }}>
              {t === "messages" ? "Messages" : "Calls"}
            </Text>
          </Pressable>
        ))}
      </View>
      <ErrorText>{active.error}</ErrorText>

      {tab === "messages" ? (
        <FlatList
          data={conversations.data ?? []}
          keyExtractor={(c) => c.counterpart}
          refreshControl={<RefreshControl refreshing={conversations.refreshing} onRefresh={conversations.pullToRefresh} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            conversations.data ? (
              <EmptyState icon="chatbubbles-outline" title="No messages yet" body="Texts sent to this number appear here." />
            ) : undefined
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.listItem}
              onPress={() => router.push({ pathname: "/number/[id]/chat", params: { id, to: item.counterpart } })}
            >
              <Avatar label={item.counterpart} />
              <View style={{ flex: 1, gap: spacing(1) }}>
                <View style={styles.row}>
                  <Text style={[styles.title, { flex: 1 }]}>{formatPhone(item.counterpart)}</Text>
                  <Text style={styles.subtitle}>{timeAgo(item.last.createdAt)}</Text>
                </View>
                <View style={styles.row}>
                  <Text
                    numberOfLines={1}
                    style={[styles.subtitle, { flex: 1 }, item.unread > 0 && { color: colors.text, fontWeight: "600" }]}
                  >
                    {item.last.direction === "outbound" ? "You: " : ""}
                    {item.last.body}
                  </Text>
                  {item.unread > 0 && (
                    <View style={{ backgroundColor: colors.primary, borderRadius: 10, minWidth: 20, paddingHorizontal: 6 }}>
                      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", textAlign: "center" }}>
                        {item.unread}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={calls.data ?? []}
          keyExtractor={(c) => c.id}
          refreshControl={<RefreshControl refreshing={calls.refreshing} onRefresh={calls.pullToRefresh} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            calls.data && callsOn ? (
              <EmptyState icon="call-outline" title="No calls yet" body="Your call history shows up here." />
            ) : undefined
          }
          ListHeaderComponent={
            number && !callsOn ? (
              <EmptyState
                icon="call-outline"
                title="Calls are off"
                body="This number is texts only. Callers hear a busy signal and can't leave voicemail. Declined calls still show below."
                action={number.voice ? <Button title="Turn on calls" variant="secondary" onPress={() => void setCalls(true)} /> : undefined}
              />
            ) : undefined
          }
          renderItem={({ item }) => <CallRow numberId={id} call={item} canCall={callsOn} />}
        />
      )}

      <View style={{ position: "absolute", right: spacing(5), bottom: spacing(8), gap: spacing(3) }}>
        {callsOn && (
          <Fab icon="keypad" label="Call" onPress={() => router.push({ pathname: "/number/[id]/dial", params: { id } })} />
        )}
        {number?.sms && (
          <Fab icon="create" label="New message" onPress={() => router.push({ pathname: "/number/[id]/compose", params: { id } })} />
        )}
      </View>
    </View>
  );
}

function Fab(props: { icon: "keypad" | "create"; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.8 : 1,
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      })}
    >
      <Ionicons name={props.icon} size={24} color="#fff" />
    </Pressable>
  );
}

const CALL_LABELS: Record<string, string> = {
  completed: "Answered",
  answered: "Answered",
  declined: "Declined · calls off",
  missed: "Missed",
  voicemail: "Voicemail",
  "no-answer": "No answer",
  busy: "Busy",
  failed: "Failed",
  canceled: "Canceled",
  ringing: "Ringing",
  queued: "Connecting",
  "in-progress": "In progress",
};

function CallRow({ numberId, call, canCall }: { numberId: string; call: Call; canCall: boolean }) {
  const missed = call.direction === "inbound" && (call.status === "missed" || call.status === "voicemail");
  const icon = call.direction === "outbound" ? "arrow-up" : "arrow-down";
  return (
    <View style={styles.listItem}>
      <Avatar label={call.counterpart} />
      <View style={{ flex: 1, gap: spacing(1) }}>
        <Text style={[styles.title, missed && { color: colors.danger }]}>{formatPhone(call.counterpart)}</Text>
        <View style={styles.row}>
          <Ionicons name={icon} size={14} color={missed ? colors.danger : colors.muted} />
          <Text style={styles.subtitle}>
            {CALL_LABELS[call.status] ?? call.status}
            {call.durationSeconds ? ` · ${duration(call.durationSeconds)}` : ""} · {timeAgo(call.createdAt)}
          </Text>
        </View>
        {call.hasVoicemail && <VoicemailPlayer numberId={numberId} call={call} />}
      </View>
      {canCall && (
        <Pressable
          hitSlop={10}
          accessibilityLabel="Call back"
          onPress={() => router.push({ pathname: "/number/[id]/dial", params: { id: numberId, to: call.counterpart } })}
        >
          <Ionicons name="call-outline" size={22} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

function VoicemailPlayer({ numberId, call }: { numberId: string; call: Call }) {
  // Load the recording on first tap only; each load is a carrier download.
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [loaded, setLoaded] = useState(false);
  const toggle = () => {
    if (!loaded) {
      player.replace(api.voicemailSource(numberId, call.id));
      setLoaded(true);
      player.play();
    } else if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) {
        void player.seekTo(0);
      }
      player.play();
    }
  };
  return (
    <Pressable
      onPress={toggle}
      style={[styles.row, { alignSelf: "flex-start", backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: spacing(3), paddingVertical: spacing(1.5) }]}
    >
      <Ionicons name={status.playing ? "pause" : "play"} size={16} color={colors.primary} />
      <Text style={{ color: colors.primary, fontWeight: "600" }}>
        Voicemail {duration(call.voicemailSeconds)}
      </Text>
    </Pressable>
  );
}

function RenameModal(props: {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onSave: (label: string) => Promise<void>;
}) {
  const [label, setLabel] = useState(props.initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal visible={props.visible} transparent animationType="fade" onShow={() => setLabel(props.initial)} onRequestClose={props.onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing(6) }}>
        <Card style={{ gap: spacing(4) }}>
          <Field label="Label" value={label} onChangeText={setLabel} maxLength={40} placeholder="e.g. Work, Selling, Travel" autoFocus />
          <ErrorText>{error}</ErrorText>
          <View style={{ flexDirection: "row", gap: spacing(3) }}>
            <Button title="Cancel" variant="secondary" onPress={props.onClose} style={{ flex: 1 }} />
            <Button
              title="Save"
              style={{ flex: 1 }}
              onPress={() => props.onSave(label.trim()).catch((err) => setError(err instanceof Error ? err.message : String(err)))}
            />
          </View>
        </Card>
      </View>
    </Modal>
  );
}
