import { useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";
import { api } from "@/api";
import { formatPhone, toE164 } from "@/format";
import { useSession } from "@/session";
import { colors, spacing } from "@/theme";
import { Button, Card, ErrorText, Field, styles } from "@/ui";

export default function Settings() {
  const { user, setUser, signOut } = useSession();
  const [phone, setPhone] = useState(user?.forwardTo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!user) return null;

  const update = async (patch: Parameters<typeof api.updateMe>[0]) => {
    setError(null);
    try {
      setUser(await api.updateMe(patch));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const savePhone = async () => {
    const normalized = phone.trim() ? toE164(phone, "1") : null;
    if (phone.trim() && !normalized) {
      setError("Enter your number with country code, e.g. +1 415 555 0123");
      return;
    }
    setSaving(true);
    await update(normalized ? { forwardTo: normalized } : { forwardTo: null, forwardingEnabled: false });
    setSaving(false);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
      <Card style={{ gap: spacing(3) }}>
        <Text style={styles.title}>Your real phone</Text>
        <Text style={styles.subtitle}>
          Used to forward incoming calls and to connect outgoing calls. It is never shown to the people you call.
        </Text>
        <Field
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+1 415 555 0123"
        />
        {user.forwardTo && <Text style={styles.subtitle}>Saved: {formatPhone(user.forwardTo)}</Text>}
        <Button title="Save" variant="secondary" onPress={savePhone} loading={saving} />
      </Card>

      <Card style={{ gap: spacing(4) }}>
        <ToggleRow
          title="Forward calls to my phone"
          subtitle="Otherwise callers go straight to voicemail."
          value={user.forwardingEnabled}
          disabled={!user.forwardTo}
          onChange={(v) => update({ forwardingEnabled: v })}
        />
        <ToggleRow
          title="Do not disturb"
          subtitle="Send all calls to voicemail and mute notifications."
          value={user.doNotDisturb}
          onChange={(v) => update({ doNotDisturb: v })}
        />
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card style={{ gap: spacing(2) }}>
        <Text style={styles.subtitle}>Signed in as</Text>
        <Text style={styles.title}>{user.email}</Text>
      </Card>
      <Button
        title="Sign out"
        variant="danger"
        onPress={() =>
          Alert.alert("Sign out?", undefined, [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: () => void signOut() },
          ])
        }
      />
    </ScrollView>
  );
}

function ToggleRow(props: {
  title: string;
  subtitle: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: spacing(1) }}>
        <Text style={[styles.title, props.disabled && { color: colors.muted }]}>{props.title}</Text>
        <Text style={styles.subtitle}>{props.subtitle}</Text>
      </View>
      <Switch
        value={props.value}
        disabled={props.disabled}
        onValueChange={props.onChange}
        trackColor={{ true: colors.primary }}
      />
    </View>
  );
}
