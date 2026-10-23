import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { api } from "@/api";
import { COUNTRIES, type Country } from "@/countries";
import { formatPhone } from "@/format";
import { colors, spacing } from "@/theme";
import type { AvailableNumber } from "@/types";
import { Button, EmptyState, ErrorText, Field, styles } from "@/ui";

export default function GetNumber() {
  const [country, setCountry] = useState<Country>(COUNTRIES[0]!);
  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [results, setResults] = useState<AvailableNumber[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);

  const search = async () => {
    setSearching(true);
    setError(null);
    try {
      setResults(
        await api.searchNumbers({
          country: country.code,
          ...(areaCode ? { areaCode } : {}),
          ...(contains ? { contains } : {}),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const buy = (number: AvailableNumber) =>
    Alert.alert(`Get ${formatPhone(number.e164)}?`, "This number will be yours until you release it.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Get number",
        onPress: async () => {
          setBuying(number.e164);
          try {
            const bought = await api.buyNumber(number);
            router.dismiss();
            router.push({ pathname: "/number/[id]", params: { id: bought.id } });
          } catch (err) {
            Alert.alert("Couldn't get that number", err instanceof Error ? err.message : String(err));
          } finally {
            setBuying(null);
          }
        },
      },
    ]);

  return (
    <FlatList
      data={results ?? []}
      keyExtractor={(n) => n.e164}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: spacing(8) }}
      ListHeaderComponent={
        <View style={{ padding: spacing(4), gap: spacing(4) }}>
          <Text style={styles.label}>Country</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(2) }}>
            {COUNTRIES.map((c) => {
              const selected = c.code === country.code;
              return (
                <Pressable
                  key={c.code}
                  onPress={() => {
                    setCountry(c);
                    setResults(null);
                  }}
                  style={{
                    paddingHorizontal: spacing(3),
                    paddingVertical: spacing(2),
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primarySoft : colors.card,
                  }}
                >
                  <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: "600" }}>
                    {c.flag} {c.code}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: spacing(3) }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Area code"
                value={areaCode}
                onChangeText={(t) => setAreaCode(t.replace(/\D/g, ""))}
                keyboardType="number-pad"
                maxLength={5}
                placeholder={country.areaCodeHint ?? "Optional"}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Contains digits"
                value={contains}
                onChangeText={(t) => setContains(t.replace(/\D/g, ""))}
                keyboardType="number-pad"
                maxLength={10}
                placeholder="e.g. 777"
              />
            </View>
          </View>
          <Button title="Search numbers" icon="search" onPress={search} loading={searching} />
          <ErrorText>{error}</ErrorText>
        </View>
      }
      ListEmptyComponent={
        results ? (
          <EmptyState icon="search-outline" title="No numbers found" body="Try a different area code or fewer digits." />
        ) : undefined
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => (
        <Pressable onPress={() => buy(item)} disabled={buying !== null} style={styles.listItem}>
          <View style={styles.avatar}>
            <Text style={{ fontSize: 18 }}>{country.flag}</Text>
          </View>
          <View style={{ flex: 1, gap: spacing(1) }}>
            <Text style={styles.title}>{formatPhone(item.e164)}</Text>
            <Text style={styles.subtitle}>
              {[item.locality, item.region].filter(Boolean).join(", ") || country.name}
              {"  "}
              {item.sms && "SMS "}
              {item.voice && "· Voice"}
            </Text>
          </View>
          {buying === item.e164 ? (
            <Text style={styles.subtitle}>Getting…</Text>
          ) : (
            <Ionicons name="add-circle" size={28} color={colors.primary} />
          )}
        </Pressable>
      )}
    />
  );
}
