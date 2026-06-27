"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Role = "admin" | "publisher";
export type AuthUser = { email: string; role: Role; publisher?: string };

// Demo kredencijali — hardkodirano dok ne postoji backend auth.
const CREDENTIALS: Record<string, { password: string; role: Role; publisher?: string }> = {
  "admin@revradar.com": { password: "admin2026", role: "admin" },
  "wireless@revradar.com": { password: "pub2026", role: "publisher", publisher: "Wireless Media Group" },
  "novosti@revradar.com": { password: "pub2026", role: "publisher", publisher: "[RS] Novosti" },
  "srbijadanas@revradar.com": { password: "pub2026", role: "publisher", publisher: "[RS] Srbija Danas Doo" },
  "24sata@revradar.com": { password: "pub2026", role: "publisher", publisher: "[HR] 24sata" },
  "hercegovina@revradar.com": { password: "pub2026", role: "publisher", publisher: "Hercegovina Info" },
  "oslobodjenje@revradar.com": { password: "pub2026", role: "publisher", publisher: "Oslobodjenje" },
  "sektor51@revradar.com": { password: "pub2026", role: "publisher", publisher: "SEKTOR 51" },
  "vecernji@revradar.com": { password: "pub2026", role: "publisher", publisher: "[HR] Večernji list" },
  "buka@revradar.com": { password: "pub2026", role: "publisher", publisher: "Buka Magazin" },
  "hotsport@revradar.com": { password: "pub2026", role: "publisher", publisher: "HotSport RS" },
  "rtvslon@revradar.com": { password: "pub2026", role: "publisher", publisher: "RTV SLON" },
};

const STORAGE_KEY = "revradar_auth_user";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
      // ignorisi nevalidan localStorage sadrzaj
    }
    setLoading(false);
  }, []);

  const login = (email: string, password: string) => {
    const key = email.trim().toLowerCase();
    const entry = CREDENTIALS[key];
    if (!entry || entry.password !== password) return false;
    const u: AuthUser = { email: key, role: entry.role, publisher: entry.publisher };
    setUser(u);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
