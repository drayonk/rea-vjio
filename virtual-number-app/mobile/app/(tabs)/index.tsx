import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { api } from "@/api";
import { countryByCode } from "@/countries";
import { formatPhone } from "@/format";
import { useLiveQuery } from "@/hooks";
import { useSubscription } from "@/subscription";
import { colors, spacing } from "@/theme";
import { Button, Card, EmptyState, ErrorText, styles } from "@/ui";

export default function Numbers() {
  const { data, error, refreshing, pullToRefresh } = useLiveQuery(api.myNumbers, 30_000);
  const { subscription, refresh } = useSubscription();
  const atLimit = subscription ? subscription.usage.numbers >= subscription.limits.numbers : false;
  const getNumber = () => router.push(atLimit ? "/paywall" : "/get-number");
  const onRefresh = async () => {
    await Promise.all([pullToRefresh(), refresh()]);
  };

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(n) => n.id}
      contentContainerStyle={{ padding: spacing(4), gap: spacing(3), flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <>
          {subscription?.releaseAt && (
            <Card style={{ gap: spacing(3), borderColor: colors.danger, marginBottom: spacing(1) }}>
              <Text style={[styles.title, { color: colors.danger }]}>Your subscription has ended</Text>
              <Text style={styles.subtitle}>
                Calling and texting are paused. Renew before {new Date(subscription.releaseAt).toLocaleDateString()} to
                keep your numbers — after that they're released.
              </Text>
              <Button title="Renew" onPress={() => router.push("/paywall")} />
            </Card>
          )}
          <ErrorText>{error}</ErrorText>
        </>
      }
      ListEmptyComponent={
        data ? (
          <EmptyState
            icon="sparkles-outline"
            title="Get your second number"
            body="Pick a local number to call and text from, without sharing your personal one."
            action={<Button title="Choose a number" icon="add" onPress={getNumber} />}
          />
        ) : undefined
      }
      ListFooterComponent={
        data && data.length > 0 ? (
          <Button title="Add another number" icon="add" variant="secondary" onPress={getNumber} />
        ) : undefined
      }
      renderItem={({ item }) => {
        const country = countryByCode(item.country);
        return (
          <Pressable
            onPress={() => router.push({ pathname: "/number/[id]", params: { id: item.id } })}
            style={({ pressed }) => [
              {
                backgroundColor: colors.card,
                borderRadius: 16,
                padding: spacing(4),
                flexDirection: "row",
                alignItems: "center",
                gap: spacing(3),
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={{ fontSize: 32 }}>{country.flag}</Text>
            <View style={{ flex: 1, gap: spacing(1) }}>
              <Text style={[styles.title, { fontSize: 18 }]}>{formatPhone(item.e164)}</Text>
              <Text style={styles.subtitle}>
                {[item.label, item.locality, country.name, !item.callsEnabled && "Texts only"].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        );
      }}
    />
  );
}
