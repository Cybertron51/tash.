"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { colors } from "@/lib/theme";
import { SignInModal } from "@/components/auth/SignInModal";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

const CARDS = [
    "/cards/BLS10-BASE-1999.svg",
    "/cards/CHZ10-BASE-1999.svg",
    "/cards/LBJ10-TOP-2003.svg",
    "/cards/PIKA10-ILLUS-1998.svg",
    "/cards/PMH10-OPTIC-2017.svg",
    "/cards/RAY10-DS-2005.svg",
    "/cards/UMB10-POP-2005.svg"
];
const TOTAL_CARDS = CARDS.length;
const COLS = 5;
const CELL_COUNT = 60;

// Real measured ratio of these PSA slab photos ≈ 1.70 (height / width)
// Expressed as CSS aspect-ratio: width / height → 10 / 17
const CELL_ASPECT = "10 / 17";

// Static initial card assignment — each cell gets a card from the pool
const INITIAL_CARDS = Array.from({ length: CELL_COUNT }, (_, i) => i % TOTAL_CARDS);

export default function LandingPage() {
    const [showSignIn, setShowSignIn] = useState(false);
    const { isAuthenticated } = useAuth();
    const router = useRouter();

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000", overflow: "hidden" }}>

            {/* ── Card grid ── */}
            <div
                style={{
                    position: "absolute",
                    // 2px bleed on every edge so no hairline gaps appear at screen borders
                    inset: "-2px",
                    display: "grid",
                    gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                    gap: "4px",
                    alignContent: "start",
                }}
            >
                {INITIAL_CARDS.map((cardIdx, i) => (
                    <div
                        key={i}
                        style={{
                            aspectRatio: CELL_ASPECT,
                            alignSelf: "start",
                            overflow: "hidden",
                        }}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={CARDS[cardIdx]}
                            alt=""
                            style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block",
                            }}
                        />
                    </div>
                ))}
            </div>

            {/* ── Dark centre overlay for text legibility ── */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "radial-gradient(ellipse 70% 60% at 50% 48%, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 65%, rgba(0,0,0,0.6) 100%)",
                }}
            />

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
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: colors.green, margin: "0 0 20px" }}>
                    Zero-Fee Trading Card Exchange
                </p>

                <h1 style={{ fontSize: "clamp(88px, 18vw, 172px)", fontWeight: 900, color: "#fff", letterSpacing: "-0.05em", margin: "0 0 20px", lineHeight: 0.88 }}>
                    tash
                </h1>

                <p style={{ fontSize: "clamp(17px, 2.4vw, 22px)", color: "rgba(255,255,255,0.8)", fontWeight: 500, margin: "0 0 10px", maxWidth: 500, lineHeight: 1.35 }}>
                    The cards you love, the market you deserve.
                </p>
                <p style={{ fontSize: "clamp(13px, 1.4vw, 15px)", color: "rgba(255,255,255,0.4)", margin: "0 0 44px", maxWidth: 400, lineHeight: 1.65 }}>
                    Finally, an exchange that&rsquo;s on your side. Thousands of slabs. One marketplace.
                </p>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                    <button
                        onClick={() => isAuthenticated ? router.push("/market") : router.push("/sign-up")}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "15px 32px", borderRadius: 12, fontSize: 15, fontWeight: 700, background: colors.green, color: "#000", border: "none", cursor: "pointer", letterSpacing: "-0.01em", boxShadow: `0 0 32px ${colors.green}55`, textDecoration: "none" }}
                    >
                        Get started <ArrowRight size={16} strokeWidth={2.5} />
                    </button>
                    <button
                        onClick={() => isAuthenticated ? router.push("/market") : setShowSignIn(true)}
                        style={{ padding: "15px 32px", borderRadius: 12, fontSize: 15, fontWeight: 600, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.14)", cursor: "pointer", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", textDecoration: "none" }}
                    >
                        Sign in
                    </button>
                </div>

                <p style={{ position: "absolute", bottom: 28, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)" }}>
                    PSA-Graded &nbsp;·&nbsp; Verified &nbsp;·&nbsp; Secure
                </p>
            </div>

            {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
        </div>
    );
}
