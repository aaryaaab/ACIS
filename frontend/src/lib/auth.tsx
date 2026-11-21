"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { acis } from "./endpoints";
import type { StudentProfile, User } from "./types";

type Status = "loading" | "anon" | "authed";
interface AuthValue {
  status: Status;
  user: User | null;
  profile: StudentProfile | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);

  // There is no token to look for: the browser sends the httpOnly cookie by itself, and the server says who we are.
  const refresh = useCallback(async () => {
    try {
      const [me, prof] = await Promise.all([acis.auth.me(), acis.profile.get()]);
      setUser(me); setProfile(prof.profile); setStatus("authed");
    } catch {
      setUser(null); setProfile(null); setStatus("anon");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onUnauthorized = () => { setUser(null); setProfile(null); setStatus("anon"); };
    window.addEventListener("acis:unauthorized", onUnauthorized);
    return () => window.removeEventListener("acis:unauthorized", onUnauthorized);
  }, []);

  const value = useMemo<AuthValue>(() => ({
    status, user, profile, refresh,
    login: async (email, password) => { await acis.auth.login({ email, password }); await refresh(); },
    register: async (name, email, password) => { await acis.auth.register({ email, password, full_name: name }); await refresh(); },
    logout: () => {
      try { sessionStorage.removeItem("acis_assessment_draft"); } catch { /* private mode */ }   // a half-finished assessment must not outlive the session
      setUser(null); setProfile(null); setStatus("anon");
      void acis.auth.logout().catch(() => { /* the server clears the cookie; if it can't be reached the session simply expires */ });
    },
  }), [status, user, profile, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
