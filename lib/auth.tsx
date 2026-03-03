"use client";

/**
 * TASH — Auth Context
 *
 * Provides authentication state and user profile data.
 * Includes a manual refresh function to sync data after Stripe operations.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  username: string | null;
  favoriteTcgs: string[];
  primaryGoal: string[];
  email: string;
  initials: string;
  cashBalance: number;
  lockedBalance: number;
  walletAddress: string;
  memberSince: string;
  stripeAccountId: string | null;
  onboardingComplete: boolean;
}

interface AuthContextValue {
  user: User | null;
  session: any | null;
  isAuthenticated: boolean;
  signIn: () => void;
  signOut: () => void;
  updateBalance: (delta: number) => void;
  refreshProfile: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<any>(null);

  const fetchProfile = useCallback(async (userId: string, email: string, accessToken: string) => {
    try {
      const res = await fetch("/api/user/profile", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        console.error("Failed to fetch user profile:", res.status);
        return;
      }
      const data = await res.json();

      const year = data.created_at
        ? new Date(data.created_at).getFullYear().toString()
        : new Date().getFullYear().toString();

      setUser({
        id: userId,
        name: data.name || "User",
        username: data.username,
        favoriteTcgs: data.favorite_tcgs || [],
        primaryGoal: data.primary_goal || [],
        email: email,
        initials: (data.name || "U")[0].toUpperCase(),
        cashBalance: Number(data.cash_balance),
        lockedBalance: Number(data.locked_balance || 0),
        walletAddress: "0x0000000000000000000000000000000000000000",
        memberSince: year,
        stripeAccountId: data.stripe_account_id || null,
        onboardingComplete: !!data.onboarding_complete,
      });
    } catch (err) {
      console.error("Failed to fetch user profile", err);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;

    // Check active session
    supabase.auth.getSession().then(({ data: { session: initSession } }) => {
      setSession(initSession);
      if (initSession?.user) {
        fetchProfile(initSession.user.id, initSession.user.email!, initSession.access_token);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "SIGNED_IN" && newSession?.user) {
        fetchProfile(newSession.user.id, newSession.user.email!, newSession.access_token);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/onboarding`,
      }
    });
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
  }, []);

  const updateBalance = useCallback((delta: number) => {
    setUser((prev) =>
      prev ? { ...prev, cashBalance: Math.max(0, prev.cashBalance + delta) } : null
    );
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user && session?.access_token) {
      await fetchProfile(session.user.id, session.user.email!, session.access_token);
    }
  }, [session, fetchProfile]);

  return (
    <AuthContext.Provider
      value={{ user, session, isAuthenticated: !!user, signIn, signOut, updateBalance, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
