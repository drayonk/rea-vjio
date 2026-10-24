import { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { ApiError, api } from "@/api";
import * as billing from "@/billing";
import { formatPhone } from "@/format";
import { useLiveQuery } from "@/hooks";
import { useSession } from "@/session";
import { PLAN_NAMES, useSubscription } from "@/subscription";
import { colors, spacing } from "@/theme";
import { Button, Card, ErrorText, Field, styles } from "@/ui";

export default function DeleteAccount() {
  const { user, deleteAccount } = useSession();
  const { subscription } = useSubscription();
  const numbers = useLiveQuery(api.myNumbers, 60_000);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const paid = subscription?.paywallEnabled && subscription.plan !== "free";

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      // Signing out of the session sends the app back to the sign-in screen.
      await deleteAccount(password);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status >= 500
          ? "We couldn't release all of your numbers just now, so nothing else was deleted. Please try again."
          : err instanceof Error
            ? err.message
            : String(err),
      );
      setBusy(false);
    }
  };

  const manage = async () => {
    const url = await billing.managementUrl().catch(() => null);
    if (url) void Linking.openURL(url);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { fontSize: 20 }]}>Permanently delete {user?.email}?</Text>
      <Card style={{ gap: spacing(2) }}>
        <Text style={styles.title}>This deletes, and can't be undone:</Text>
        <Text style={styles.subtitle}>
          • {numbers.data && numbers.data.length > 0
            ? `Your number${numbers.data.length === 1 ? "" : "s"} ${numbers.data.map((n) => formatPhone(n.e164)).join(", ")}. They're released to the carrier and may be given to someone else.`
            : "Any numbers you have. They're released to the carrier."}
        </Text>
        <Text style={styles.subtitle}>• All texts, call history and voicemails</Text>
        <Text style={styles.subtitle}>• Your settings, including your saved real phone number</Text>
      </Card>

      {paid && (
        <Card style={{ gap: spacing(3), borderColor: colors.danger }}>
          <Text style={[styles.title, { color: colors.danger }]}>Cancel your {PLAN_NAMES[subscription.plan]} subscription first</Text>
          <Text style={styles.subtitle}>
            Deleting your account doesn't stop App Store or Google Play billing. Only you can cancel it in your store
            account.
          </Text>
          <Button title="Manage subscription" variant="secondary" onPress={manage} />
        </Card>
      )}

      <View style={{ gap: spacing(3) }}>
        <Field
          label="Enter your password to confirm"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
        />
        <ErrorText>{error}</ErrorText>
        <Button
          title="Delete my account"
          variant="danger"
          onPress={confirm}
          loading={busy}
          disabled={!password}
        />
      </View>
    </ScrollView>
  );
}
