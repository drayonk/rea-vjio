import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { colors, spacing } from "./theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Button(props: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: ViewStyle;
}) {
  const variant = props.variant ?? "primary";
  const fg = variant === "primary" ? "#fff" : variant === "danger" ? colors.danger : colors.primary;
  const disabled = props.disabled || props.loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" ? styles.primary : styles.secondary,
        (pressed || disabled) && { opacity: 0.6 },
        props.style,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {props.icon && <Ionicons name={props.icon} size={18} color={fg} />}
          <Text style={[styles.buttonText, { color: fg }]}>{props.title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: spacing(1.5) }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={[styles.input, style]} {...rest} />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <Text style={styles.error}>{children}</Text> : null;
}

export function EmptyState(props: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={props.icon} size={32} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{props.title}</Text>
      {props.body && <Text style={styles.emptyBody}>{props.body}</Text>}
      {props.action}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Avatar({ label }: { label: string }) {
  return (
    <View style={styles.avatar}>
      <Ionicons name="person" size={18} color={colors.primary} accessibilityLabel={label} />
    </View>
  );
}

export const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  button: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: spacing(4),
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primarySoft },
  buttonText: { fontSize: 16, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "600", color: colors.muted },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing(3),
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  error: { color: colors.danger, fontSize: 14 },
  empty: { alignItems: "center", padding: spacing(8), gap: spacing(3) },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text, textAlign: "center" },
  emptyBody: { fontSize: 15, color: colors.muted, textAlign: "center" },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing(4),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    backgroundColor: colors.card,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing(17) },
  title: { fontSize: 16, fontWeight: "600", color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted },
});
