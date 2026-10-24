import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, configureApi } from "./api";
import { registerForPush } from "./notifications";
import type { User } from "./types";

const TOKEN_KEY = "secondline.token";

interface SessionValue {
  ready: boolean;
  user: User | null;
  signIn: (mode: "login" | "register", email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Deletes the account on the server, then clears this device. */
  deleteAccount: (password: string) => Promise<void>;
  setUser: (user: User) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const signOut = useCallback(async () => {
    await api.setPushToken(null).catch(() => {});
    configureApi({ token: null });
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    configureApi({ token: null, onUnauthorized: () => void signOut() });
    (async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token) {
        configureApi({ token });
        try {
          setUser(await api.me());
          void registerForPush();
        } catch {
          // Offline or expired: expired tokens are cleared by onUnauthorized.
        }
      }
      setReady(true);
    })();
  }, [signOut]);

  const deleteAccount = useCallback(async (password: string) => {
    await api.deleteAccount(password);
    configureApi({ token: null });
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setUser(null);
  }, []);

  const signIn = useCallback(async (mode: "login" | "register", email: string, password: string) => {
    const session = mode === "login" ? await api.login(email, password) : await api.register(email, password);
    await SecureStore.setItemAsync(TOKEN_KEY, session.token);
    configureApi({ token: session.token });
    setUser(session.user);
    void registerForPush();
  }, []);

  const value = useMemo(
    () => ({ ready, user, signIn, signOut, deleteAccount, setUser }),
    [ready, user, signIn, signOut, deleteAccount],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
