import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "@/session";
import { colors } from "@/theme";

function RootStack() {
  const { ready, user } = useSession();
  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="get-number" options={{ title: "Get a number", presentation: "modal" }} />
        <Stack.Screen name="number/[id]/index" options={{ title: "" }} />
        <Stack.Screen name="number/[id]/chat" options={{ title: "" }} />
        <Stack.Screen name="number/[id]/compose" options={{ title: "New message", presentation: "modal" }} />
        <Stack.Screen name="number/[id]/dial" options={{ title: "Call", presentation: "modal" }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <RootStack />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
