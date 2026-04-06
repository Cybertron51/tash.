"use client";

/**
 * Forgot password — requests a Supabase recovery email.
 * Add this URL + /auth/reset-password to Supabase Auth → URL configuration → Redirect URLs.
 */

import { useState } from "react";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError("Sign-in is not configured.");
      return;
    }
    setLoading(true);
    setError(null);
    const trimmed = email.trim();
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4"
      style={{ background: colors.background }}
    >
      <div className="w-full max-w-[400px]">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-[13px] font-semibold"
          style={{ color: colors.green }}
        >
          <ArrowLeft size={16} />
          Back to home
        </Link>

        <h1 className="text-[22px] font-bold tracking-tight" style={{ color: colors.textPrimary }}>
          Reset your password
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: colors.textSecondary }}>
          Enter your email. If an account exists, we&apos;ll send a link to choose a new password.
          The link expires after a short time — request again if needed.
        </p>

        {sent ? (
          <div
            className="mt-6 rounded-[12px] border p-4 text-[13px]"
            style={{
              borderColor: colors.border,
              background: colors.surface,
              color: colors.textSecondary,
            }}
          >
            <p style={{ color: colors.textPrimary, fontWeight: 600 }}>Check your email</p>
            <p className="mt-2">
              We sent a message to <span className="font-mono">{email.trim()}</span> with recovery
              instructions. If you don&apos;t see it, check spam or try again in a few minutes.
            </p>
            <p className="mt-4 text-[12px]" style={{ color: colors.textMuted }}>
              Still stuck? Contact support from your invite email or account page — we can verify
              ownership and help recover access.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            {error && (
              <div
                className="rounded-[8px] p-3 text-[12px]"
                style={{
                  background: "rgba(255, 60, 60, 0.1)",
                  color: colors.red,
                  border: `1px solid rgba(255, 60, 60, 0.2)`,
                }}
              >
                {error}
              </div>
            )}
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[10px] border px-4 py-[11px] text-[13px] outline-none"
              style={{
                background: "transparent",
                borderColor: colors.borderSubtle,
                color: colors.textPrimary,
              }}
            />
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] py-[11px] text-[13px] font-bold disabled:opacity-60"
              style={{ background: colors.green, color: colors.textInverse }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
