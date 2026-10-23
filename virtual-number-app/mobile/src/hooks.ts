import { useFocusEffect } from "expo-router";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Loads data while the screen is focused, re-polling on an interval and
 * whenever a push notification arrives.
 */
export function useLiveQuery<T>(load: () => Promise<T>, intervalMs = 10_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      const timer = setInterval(() => void refresh(), intervalMs);
      return () => clearInterval(timer);
    }, [refresh, intervalMs]),
  );

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => void refresh());
    return () => sub.remove();
  }, [refresh]);

  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return { data, error, refresh, refreshing, pullToRefresh, setData };
}
