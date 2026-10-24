import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api";
import { toE164 } from "@/format";
import { spacing } from "@/theme";
import { Button, ErrorText, Field } from "@/ui";
import { countryByCode } from "@/countries";
import { useLiveQuery } from "@/hooks";
import { showPaywallFor } from "@/subscription";

export default function Compose() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const numbers = useLiveQuery(api.myNumbers, 60_000);
  const dial = countryByCode(numbers.data?.find((n) => n.id === id)?.country ?? "US").dial;
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    const recipient = toE164(to, dial);
    if (!recipient) {
      setError("Enter a valid phone number");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.sendSms(id, recipient, body);
      router.replace({ pathname: "/number/[id]/chat", params: { id, to: recipient } });
    } catch (err) {
      setSending(false);
      if (showPaywallFor(err)) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <View style={{ padding: spacing(4), gap: spacing(4) }}>
      <Field label="To" value={to} onChangeText={setTo} keyboardType="phone-pad" placeholder={`+${dial} …`} autoFocus />
      <Field
        label="Message"
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={1600}
        style={{ minHeight: 120, paddingTop: spacing(3), textAlignVertical: "top" }}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Send" icon="send" onPress={send} loading={sending} disabled={!to.trim() || !body.trim()} />
    </View>
  );
}
