import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/session";
import { colors, spacing } from "@/theme";
import { Button, ErrorText, Field } from "@/ui";

export default function Login() {
  const { signIn } = useSession();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(mode, email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: spacing(6), gap: spacing(5) }}>
          <View style={{ alignItems: "center", gap: spacing(3), marginBottom: spacing(4) }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="call" size={36} color="#fff" />
            </View>
            <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text }}>SecondLine</Text>
            <Text style={{ fontSize: 16, color: colors.muted, textAlign: "center" }}>
              A second phone number for calls and texts — keep your real number private.
            </Text>
          </View>

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="At least 8 characters"
            onSubmitEditing={submit}
          />
          <ErrorText>{error}</ErrorText>
          <Button title={mode === "login" ? "Sign in" : "Create account"} onPress={submit} loading={busy} />
          <Pressable onPress={() => setMode(mode === "login" ? "register" : "login")} style={{ padding: spacing(2) }}>
            <Text style={{ textAlign: "center", color: colors.primary, fontWeight: "600" }}>
              {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
