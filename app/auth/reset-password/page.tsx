"use client";

/**
 * Land here from Supabase password recovery email (redirectTo must match dashboard allowlist).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled && session?.user) setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (!session?.user) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        setReady(true);
      }
    });

    const t = window.setTimeout(() => {
      if (!cancelled) setTimedOut(true);
    }, 15000);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error: u } = await supabase.auth.updateUser({ password });
      if (u) throw u;
      setDone(true);
      setTimeout(() => router.replace("/market"), 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 px-6"
        style={{ background: colors.background }}
      >
        <CheckCircle size={52} strokeWidth={1.5} style={{ color: colors.green }} />
        <p className="text-[18px] font-bold" style={{ color: colors.textPrimary }}>
          Password updated
        </p>
        <p className="text-[13px]" style={{ color: colors.textMuted }}>
          Taking you to the market…
        </p>
      </div>
    );
  }

  if (timedOut && !ready) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ background: colors.background }}
      >
        <p className="text-[15px] font-semibold" style={{ color: colors.textPrimary }}>
          Link invalid or expired
        </p>
        <p className="max-w-md text-[13px] leading-relaxed" style={{ color: colors.textSecondary }}>
          Open the latest email from us, or request a new reset link.
        </p>
        <Link
          href="/forgot-password"
          className="text-[13px] font-bold"
          style={{ color: colors.green }}
        >
          Forgot password again
        </Link>
        <Link href="/" className="text-[12px]" style={{ color: colors.textMuted }}>
          Home
        </Link>
      </div>
    );
  }

  if (!ready) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3"
        style={{ background: colors.background }}
      >
        <Loader2 className="animate-spin" size={28} style={{ color: colors.green }} />
        <span className="text-[13px]" style={{ color: colors.textMuted }}>
          Verifying reset link…
        </span>
      </div>
    );
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
          Home
        </Link>

        <h1 className="text-[22px] font-bold tracking-tight" style={{ color: colors.textPrimary }}>
          Choose your new password
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: colors.textSecondary }}>
          Sign-in will use this password going forward.
        </p>

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
            type="password"
            autoComplete="new-password"
            placeholder="New password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-[10px] border px-4 py-[11px] text-[13px] outline-none"
            style={{
              background: "transparent",
              borderColor: colors.borderSubtle,
              color: colors.textPrimary,
            }}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
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
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-[10px] py-[11px] text-[13px] font-bold disabled:opacity-60"
            style={{ background: colors.green, color: colors.textInverse }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
