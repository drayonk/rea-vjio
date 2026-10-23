import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Asks for permission and uploads this device's Expo push token. Push needs a
 * physical device and an EAS project id (run `eas init`); otherwise the app
 * still works and refreshes by polling.
 */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Messages and calls",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const status = current.granted ? current.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.setPushToken(data);
  } catch (err) {
    console.warn("push registration failed", err);
  }
}
