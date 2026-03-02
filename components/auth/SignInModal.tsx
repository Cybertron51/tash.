"use client";

/**
 * SignInModal — Branded entry point for sign-in.
 *
 * Hand off to the authentication provider.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import { colors } from "@/lib/theme";
import { supabase } from "@/lib/supabase";

interface SignInModalProps {
  onClose: () => void;
}

export function SignInModal({ onClose }: SignInModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setErrorMsg("");

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onClose();
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to authenticate.");
    } finally {
      setLoading(false);
    }
  }

  const handleGoogleOAuth = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/onboarding`,
      },
    });
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-[380px] rounded-[16px] p-6"
        style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-[#2A2A2A]"
          style={{ color: colors.textMuted }}
        >
          <X size={15} strokeWidth={2} />
        </button>

        {/* Logo mark */}
        <div
          className="mb-5 flex h-10 w-10 items-center justify-center rounded-[10px]"
          style={{ background: colors.green }}
        >
          <span className="text-[16px] font-black" style={{ color: colors.textInverse }}>
            t
          </span>
        </div>

        <h2
          className="text-[20px] font-bold tracking-tight"
          style={{ color: colors.textPrimary }}
        >
          Sign in to tash
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: colors.textSecondary }}>
          Trade and manage your card portfolio.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          {errorMsg && (
            <div className="rounded-[8px] p-3 text-[12px] font-medium" style={{ background: "rgba(255, 60, 60, 0.1)", color: colors.red, border: `1px solid rgba(255, 60, 60, 0.2)` }}>
              {errorMsg}
            </div>
          )}
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-[10px] border px-4 py-[11px] text-[13px] outline-none transition-colors"
            style={{
              background: "transparent",
              borderColor: colors.borderSubtle,
              color: colors.textPrimary
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-[10px] border px-4 py-[11px] text-[13px] outline-none transition-colors"
            style={{
              background: "transparent",
              borderColor: colors.borderSubtle,
              color: colors.textPrimary
            }}
          />

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-[10px] py-[11px] text-[13px] font-bold transition-all duration-150 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
            style={{ background: colors.green, color: colors.textInverse }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Sign In"}
          </button>
        </form>

        <div className="my-5 flex items-center">
          <div className="flex-1 border-t" style={{ borderColor: colors.borderSubtle }}></div>
          <span className="px-4 text-[12px] font-medium" style={{ color: colors.textMuted }}>OR</span>
          <div className="flex-1 border-t" style={{ borderColor: colors.borderSubtle }}></div>
        </div>

        <button
          onClick={handleGoogleOAuth}
          className="flex w-full items-center justify-center gap-3 rounded-[10px] border py-[11px] text-[13px] font-semibold transition-colors hover:bg-[#1E1E1E]"
          style={{
            color: colors.textPrimary,
            borderColor: colors.borderSubtle,
            backgroundColor: "transparent"
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        <p className="mt-5 text-center text-[12px]" style={{ color: colors.textMuted }}>
          Don't have an account?{" "}
          <button
            type="button"
            onClick={() => { onClose(); router.push("/sign-up"); }}
            className="font-semibold transition-colors hover:text-white"
            style={{ color: colors.green }}
          >
            Sign Up
          </button>
        </p>

        <p className="mt-4 text-center text-[11px]" style={{ color: colors.textMuted }}>
          By continuing, you agree to tash&apos;s{" "}
          <span style={{ color: colors.textSecondary, cursor: "pointer" }}>Terms of Service</span>
          {" "}and{" "}
          <span style={{ color: colors.textSecondary, cursor: "pointer" }}>Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}
