"use client";

import React, { useState, useEffect } from "react";
import { ArrowRight, Loader2, Check } from "lucide-react";
import { colors } from "@/lib/theme";
import { SignInModal } from "@/components/auth/SignInModal";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";


type Phase = "email" | "referral" | "unlocked";

export default function LandingPage() {
    const [phase, setPhase] = useState<Phase>("email");
    const [showSignIn, setShowSignIn] = useState(false);
    const { isAuthenticated } = useAuth();
    const router = useRouter();

    // Email capture (step 1 — always collected first)
    const [userEmail, setUserEmail] = useState("");
    const [emailError, setEmailError] = useState("");

    // Referral state
    const [referralCode, setReferralCode] = useState("");
    const [isCheckingReferral, setIsCheckingReferral] = useState(false);
    const [referralError, setReferralError] = useState("");
    const [isReferralValid, setIsReferralValid] = useState(false);
    const [lastCheckedCode, setLastCheckedCode] = useState("");

    // Waitlist state — used for inline feedback after failed referral
    const [waitlistState, setWaitlistState] = useState<"idle" | "success">("idle");
    const [waitlistMsg, setWaitlistMsg] = useState("");
    // Track the email that was actually submitted to avoid double-POST
    const [capturedEmail, setCapturedEmail] = useState("");

    // Redirect if already logged in
    useEffect(() => {
        if (isAuthenticated) {
            router.push("/market");
        }
    }, [isAuthenticated, router]);

    // ── Email capture (step 1) ──
    const handleEmailContinue = (e?: React.FormEvent) => {
        e?.preventDefault();
        const trimmed = userEmail.trim();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
            setEmailError("Enter a valid email address.");
            return;
        }
        setEmailError("");
        // Fire-and-forget: capture email immediately, before they even try a referral code.
        // Re-submit if the email changed (e.g. user went Back and edited it).
        if (trimmed !== capturedEmail) {
            setCapturedEmail(trimmed);
            fetch("/api/waitlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: trimmed }),
            }).catch(() => {/* silent — referral success path is unaffected */});
        }
        setPhase("referral");
    };

    // ── Show waitlist confirmation inline after failed referral ──
    const showWaitlistConfirmation = (email: string) => {
        setWaitlistState("success");
        setWaitlistMsg(`You're on the list — we'll email ${email} when access opens.`);
    };

    // ── Referral validation ──
    const handleReferralCheck = async () => {
        if (!referralCode) {
            setReferralError("Please enter a referral code.");
            setIsReferralValid(false);
            return;
        }
        setIsCheckingReferral(true);
        setReferralError("");
        setIsReferralValid(false);
        try {
            const res = await fetch(`/api/referral/validate?code=${referralCode}`);
            const data = await res.json();
            if (data.valid) {
                document.cookie = `referral_code=${referralCode}; path=/; max-age=3600; SameSite=Lax`;
                setIsReferralValid(true);
                setPhase("unlocked");
            } else {
                setIsReferralValid(false);
                // Email was already submitted when they hit Continue — just show confirmation
                if (capturedEmail) {
                    showWaitlistConfirmation(userEmail);
                } else {
                    setReferralError("Invalid referral code.");
                }
            }
        } catch {
            setReferralError("System error. Please try again later.");
            setIsReferralValid(false);
        } finally {
            setIsCheckingReferral(false);
            setLastCheckedCode(referralCode);
        }
    };

    // Actively validate referral code as it is entered (debounced, no re-check loops)
    useEffect(() => {
        if (!referralCode) {
            setReferralError("");
            setIsReferralValid(false);
            setLastCheckedCode("");
            return;
        }
        // Only auto-validate when the user has changed the code since the last check
        if (referralCode === lastCheckedCode) return;

        const timeout = setTimeout(() => {
            if (!isCheckingReferral) {
                handleReferralCheck();
            }
        }, 500);

        return () => clearTimeout(timeout);
    }, [referralCode, lastCheckedCode, isCheckingReferral]);



    // ── Render the current phase content ──
    const renderPhaseContent = () => {
        switch (phase) {
            // ───────────────────────────────────────────
            // Phase 1: Email capture
            // ───────────────────────────────────────────
            case "email":
                return (
                    <form
                        onSubmit={handleEmailContinue}
                        style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", maxWidth: 380 }}
                    >
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", margin: 0 }}>
                            Get Started
                        </p>

                        {emailError && (
                            <div style={{ padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, background: "rgba(255, 60, 60, 0.1)", color: colors.red, border: "1px solid rgba(255, 60, 60, 0.2)" }}>
                                {emailError}
                            </div>
                        )}

                        <input
                            type="email"
                            placeholder="your@email.com"
                            aria-label="Email address"
                            value={userEmail}
                            onChange={(e) => { setUserEmail(e.target.value); setEmailError(""); }}
                            onKeyDown={(e) => { if (e.key === "Enter") handleEmailContinue(); }}
                            style={{
                                width: "100%",
                                boxSizing: "border-box",
                                background: "rgba(255,255,255,0.06)",
                                border: `1px solid ${emailError ? "rgba(255,60,60,0.4)" : "rgba(255,255,255,0.12)"}`,
                                borderRadius: 12,
                                padding: "18px 20px",
                                color: "#fff",
                                fontSize: 16,
                                outline: "none",
                                transition: "border-color 0.15s",
                            }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = `${colors.green}88`; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = emailError ? "rgba(255,60,60,0.4)" : "rgba(255,255,255,0.12)"; }}
                            autoFocus
                        />

                        <button
                            type="submit"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                                padding: "16px 24px",
                                borderRadius: 12,
                                fontSize: 15,
                                fontWeight: 700,
                                background: colors.green,
                                color: "#000",
                                border: "none",
                                cursor: "pointer",
                                boxShadow: `0 0 24px ${colors.green}44`,
                                transition: "transform 0.15s, box-shadow 0.15s, filter 0.15s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.02)"; e.currentTarget.style.boxShadow = `0 0 36px ${colors.green}66`; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = `0 0 24px ${colors.green}44`; }}
                        >
                            Continue <ArrowRight size={16} strokeWidth={2.5} />
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowSignIn(true)}
                            style={{
                                background: "none",
                                border: "none",
                                color: "rgba(255,255,255,0.35)",
                                fontSize: 13,
                                cursor: "pointer",
                                padding: "4px 0",
                                fontWeight: 500,
                                transition: "color 0.15s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
                        >
                            Already have an account? Sign in
                        </button>
                    </form>
                );

            // ───────────────────────────────────────────
            // Phase 2: Referral Code Input
            // ───────────────────────────────────────────
            case "referral":
                return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", maxWidth: 380 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", margin: 0 }}>
                            Invite Only
                        </p>

                        {referralError && waitlistState !== "success" && (
                            <div
                                style={{
                                    padding: "12px 16px",
                                    borderRadius: 10,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    background: "rgba(255, 60, 60, 0.1)",
                                    color: colors.red,
                                    border: "1px solid rgba(255, 60, 60, 0.2)",
                                }}
                            >
                                {referralError}
                            </div>
                        )}

                        {/* Waitlist confirmation — shown after failed referral */}
                        {waitlistState === "success" && (
                            <div style={{ padding: "14px 16px", borderRadius: 10, background: `${colors.green}12`, border: `1px solid ${colors.green}33` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                    <Check size={14} color={colors.green} strokeWidth={2.5} />
                                    <span style={{ fontSize: 13, fontWeight: 700, color: colors.green }}>You're on the list</span>
                                </div>
                                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0 }}>{waitlistMsg}</p>
                            </div>
                        )}

                        <div style={{ position: "relative" }}>
                            <input
                                type="text"
                                placeholder="REFERRAL CODE"
                                aria-label="Referral Code"
                                value={referralCode}
                                onChange={(e) => {
                                    setReferralCode(e.target.value.toUpperCase());
                                    setReferralError("");
                                    setIsReferralValid(false);
                                    if (waitlistState === "success") setWaitlistState("idle");
                                }}
                                onKeyDown={(e) => { if (e.key === "Enter") handleReferralCheck(); }}
                                style={{
                                    width: "100%",
                                    boxSizing: "border-box",
                                    background: "rgba(255,255,255,0.06)",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    borderRadius: 12,
                                    padding: "18px 48px 18px 20px",
                                    color: "#fff",
                                    fontSize: 16,
                                    fontFamily: "var(--font-geist-mono), monospace",
                                    letterSpacing: "0.18em",
                                    textTransform: "uppercase",
                                    outline: "none",
                                    transition: "border-color 0.15s",
                                }}
                                onFocus={(e) => { e.currentTarget.style.borderColor = `${colors.green}88`; }}
                                onBlur={(e) => { e.currentTarget.style.borderColor = isReferralValid ? colors.green : "rgba(255,255,255,0.12)"; }}
                                autoFocus
                            />
                            <div
                                style={{
                                    position: "absolute",
                                    right: 14,
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 24,
                                    height: 24,
                                    borderRadius: 999,
                                    background: isReferralValid ? `${colors.green}20` : "transparent",
                                    transition: "background 0.18s ease, transform 0.12s ease",
                                }}
                            >
                                {isCheckingReferral ? (
                                    <Loader2 size={18} color={colors.green} style={{ animation: "spin 1s linear infinite" }} />
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!isReferralValid && referralCode) {
                                                handleReferralCheck();
                                            }
                                        }}
                                        disabled={!referralCode || isReferralValid}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            width: "100%",
                                            height: "100%",
                                            borderRadius: "999px",
                                            border: "none",
                                            background: "transparent",
                                            cursor: !referralCode || isReferralValid ? "default" : "pointer",
                                            padding: 0,
                                        }}
                                        aria-label={isReferralValid ? "Referral code verified" : "Submit referral code"}
                                    >
                                        <ArrowRight
                                            size={18}
                                            strokeWidth={2.3}
                                            color={isReferralValid ? colors.green : referralCode ? colors.green : "rgba(255,255,255,0.3)"}
                                        />
                                    </button>
                                )}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setPhase("email");
                                setReferralError("");
                                setReferralCode("");
                                setIsReferralValid(false);
                                setLastCheckedCode("");
                                setWaitlistState("idle");
                                setWaitlistMsg("");
                                // Allow re-capture if they change their email
                                setCapturedEmail("");
                            }}
                            style={{
                                background: "none",
                                border: "none",
                                color: "rgba(255,255,255,0.35)",
                                fontSize: 13,
                                cursor: "pointer",
                                padding: "8px 0",
                                fontWeight: 500,
                                transition: "color 0.15s",
                                marginTop: 4,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
                        >
                            ← Back
                        </button>
                    </div>
                );


            // ───────────────────────────────────────────
            // Phase 3: Unlocked — Get Started / Sign In
            // ───────────────────────────────────────────
            case "unlocked":
                return (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%", maxWidth: 380 }}>
                        <div
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 16px",
                                borderRadius: 10,
                                fontSize: 12,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                background: `${colors.green}18`,
                                color: colors.green,
                                border: `1px solid ${colors.green}33`,
                            }}
                        >
                            ✓ Invite Verified — {referralCode}
                        </div>

                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", width: "100%" }}>
                            <button
                                onClick={() => router.push(`/sign-up${userEmail ? `?email=${encodeURIComponent(userEmail)}` : ""}`)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "15px 32px",
                                    borderRadius: 12,
                                    fontSize: 15,
                                    fontWeight: 700,
                                    background: colors.green,
                                    color: "#000",
                                    border: "none",
                                    cursor: "pointer",
                                    letterSpacing: "-0.01em",
                                    boxShadow: `0 0 32px ${colors.green}55`,
                                    transition: "transform 0.15s, filter 0.15s",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.03)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                            >
                                Get started <ArrowRight size={16} strokeWidth={2.5} />
                            </button>
                            <button
                                onClick={() => setShowSignIn(true)}
                                style={{
                                    padding: "15px 32px",
                                    borderRadius: 12,
                                    fontSize: 15,
                                    fontWeight: 600,
                                    background: "rgba(255,255,255,0.07)",
                                    color: "rgba(255,255,255,0.8)",
                                    border: "1px solid rgba(255,255,255,0.14)",
                                    cursor: "pointer",
                                    backdropFilter: "blur(12px)",
                                    WebkitBackdropFilter: "blur(12px)",
                                    transition: "transform 0.15s, background 0.15s, filter 0.15s",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.03)"; e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
                            >
                                Sign in
                            </button>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000", overflow: "hidden" }}>

            {/* ── Content ── */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 24px",
                    textAlign: "center",
                }}
            >
                <div style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: `1px solid ${colors.green}44`,
                    background: `${colors.green}12`,
                    marginBottom: 24,
                }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.green, display: "inline-block", boxShadow: `0 0 6px ${colors.green}` }} />
                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: colors.green, margin: 0 }}>
                        Zero-Fee Trading Card Exchange
                    </p>
                </div>

                <h1 style={{ fontSize: "clamp(88px, 18vw, 172px)", fontWeight: 900, color: "#fff", letterSpacing: "-0.05em", margin: "0 0 20px", lineHeight: 0.88 }}>
                    tash.
                </h1>

                <p style={{ fontSize: "clamp(17px, 2.4vw, 22px)", color: "rgba(255,255,255,0.8)", fontWeight: 500, margin: "0 0 10px", maxWidth: 500, lineHeight: 1.35 }}>
                    The cards you love, the market you deserve.
                </p>
                <div style={{ marginBottom: 44 }} />

                {renderPhaseContent()}

                <div style={{ position: "absolute", bottom: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", margin: 0 }}>
                        PSA-Graded &nbsp;·&nbsp; Verified &nbsp;·&nbsp; Secure
                    </p>
                    <a href="/privacy" style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.25)", textDecoration: "none", letterSpacing: "0.06em" }}>
                        Privacy Policy
                    </a>
                </div>
            </div>

            {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} initialEmail={userEmail} />}

            {/* Spin keyframes for Loader2 */}
            <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>
    );
}
