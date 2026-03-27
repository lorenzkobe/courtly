"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { courtlyApi } from "@/lib/api/courtly-client";
import type { SessionUser } from "@/lib/types/courtly";

type AuthContextValue = {
  user: SessionUser | null;
  isLoading: boolean;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    const { data } = await courtlyApi.auth.session();
    setUser(data.user);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refreshSession();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  const login = useCallback(async (input: { email: string; password: string }) => {
    await courtlyApi.auth.login(input);
    await refreshSession();
  }, [refreshSession]);

  const logout = useCallback(async () => {
    await courtlyApi.auth.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      login,
      logout,
      refreshSession,
    }),
    [user, isLoading, login, logout, refreshSession],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
