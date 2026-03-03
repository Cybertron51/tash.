"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { colors, layout } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import Link from "next/link";

export default function ChangePasswordPage() {
    const { user, isAuthenticated } = useAuth();
    const router = useRouter();

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // simple protection
    if (!isAuthenticated) {
        return null;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!supabase) {
            setError("Authentication service not available");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        if (password.length < 6) {
            setError("Password must be at least 6 characters");
            return;
        }

        setLoading(true);

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            });

            if (updateError) throw updateError;

            setSuccess(true);
        } catch (err: any) {
            setError(err.message || "Failed to update password");
        } finally {
            setLoading(false);
        }
    }

    const pageStyle: React.CSSProperties = {
        minHeight: `calc(100dvh - ${layout.chromeHeight})`,
        background: colors.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 40,
    };

    const cardStyle: React.CSSProperties = {
        width: "100%",
        maxWidth: 400,
        paddingLeft: 16,
        paddingRight: 16,
    };

    if (success) {
        return (
            <div style={pageStyle}>
                <div style={{ ...cardStyle, textAlign: "center", paddingTop: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                    <CheckCircle size={64} strokeWidth={1.5} style={{ color: colors.green }} />
                    <div>
                        <h2 style={{ fontSize: 22, fontWeight: 700, color: colors.textPrimary, letterSpacing: "-0.02em", margin: "0" }}>
                            Password Updated
                        </h2>
                        <p style={{ fontSize: 15, color: colors.textSecondary, marginTop: 8 }}>
                            Your password has been successfully changed.
                        </p>
                    </div>
                    <Link
                        href="/account"
                        style={{
                            display: "block",
                            width: "100%",
                            padding: "14px 0",
                            borderRadius: 12,
                            fontSize: 15,
                            fontWeight: 700,
                            background: colors.green,
                            color: colors.textInverse,
                            textDecoration: "none",
                            textAlign: "center",
                            marginTop: 16,
                        }}
                    >
                        Back to Account →
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div style={pageStyle}>
            <div style={cardStyle}>
                <Link
                    href="/account"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        color: colors.textMuted,
                        textDecoration: "none",
                        marginBottom: 24,
                    }}
                >
                    <ArrowLeft size={16} />
                    Back
                </Link>

                <h1
                    style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: colors.textPrimary,
                        letterSpacing: "-0.02em",
                        margin: "0 0 8px 0",
                    }}
                >
                    Change Password
                </h1>
                <p style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24 }}>
                    Enter a new password for your account.
                </p>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {error && (
                        <div
                            style={{
                                background: "rgba(255,80,0,0.1)",
                                border: `1px solid ${colors.red}44`,
                                borderRadius: 10,
                                padding: "12px 16px",
                                fontSize: 13,
                                color: colors.red,
                            }}
                        >
                            {error}
                        </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            New Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{
                                width: "100%",
                                padding: "14px 16px",
                                fontSize: 15,
                                borderRadius: 12,
                                border: `1px solid ${colors.border}`,
                                background: colors.surface,
                                color: colors.textPrimary,
                                outline: "none",
                            }}
                        />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Confirm Password
                        </label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            style={{
                                width: "100%",
                                padding: "14px 16px",
                                fontSize: 15,
                                borderRadius: 12,
                                border: `1px solid ${colors.border}`,
                                background: colors.surface,
                                color: colors.textPrimary,
                                outline: "none",
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !password || !confirmPassword}
                        style={{
                            width: "100%",
                            padding: "14px 0",
                            borderRadius: 12,
                            fontSize: 15,
                            fontWeight: 700,
                            cursor: (loading || !password || !confirmPassword) ? "not-allowed" : "pointer",
                            border: "none",
                            background: (loading || !password || !confirmPassword) ? colors.surface : colors.green,
                            color: (loading || !password || !confirmPassword) ? colors.textMuted : colors.textInverse,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            marginTop: 8,
                            transition: "all 0.15s",
                        }}
                    >
                        {loading ? (
                            <>
                                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                                Updating...
                            </>
                        ) : (
                            "Update Password"
                        )}
                    </button>
                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </form>
            </div>
        </div>
    );
}
