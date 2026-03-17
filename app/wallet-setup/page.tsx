"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronRight, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function WalletSetupPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { session, user, isProfileComplete, refreshProfile } = useAuth();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Auto-refresh profile if returning from Stripe
    useEffect(() => {
        const status = searchParams.get("status");
        if (status === "success" || status === "refresh") {
            refreshProfile().then(() => {
                const returnTo = searchParams.get("returnTo");
                router.push(returnTo || "/portfolio");
            });
        }
    }, [searchParams, refreshProfile, router]);

    // Require session
    useEffect(() => {
        if (!session) {
            const timer = setTimeout(() => {
                if (!session) router.push("/sign-up");
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [session, router]);


    const handleConnect = async () => {
        if (!user) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const res = await fetch("/api/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: user.id,
                    email: user.email,
                    returnTo: searchParams.get("returnTo")
                }),
            });

            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.error || "Failed to get onboarding link");
            }
        } catch (err: any) {
            setError(err.message);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white flex">
            {/* Left Pane - Form/Content */}
            <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24 xl:px-32 relative z-10 w-full max-w-2xl mx-auto lg:mx-0">
                <motion.div
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-8"
                >
                    <div>
                        <h1 className="text-3xl font-bold mb-4">Connect your Wallet</h1>
                        <p className="text-zinc-400 text-lg leading-relaxed">
                            To withdraw funds on tash., you need to connect your financial account via Stripe.
                            This ensures secure, instant settlements.
                        </p>
                    </div>

                    <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 space-y-4">
                        <div className="flex items-center space-x-4">
                            <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                                <TrendingUp className="h-5 w-5" />
                            </div>
                            <p className="text-sm font-medium">Instant Withdrawals to your bank</p>
                        </div>
                        <div className="flex items-center space-x-4">
                            <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-400">
                                <div className="font-bold text-xs">$</div>
                            </div>
                            <p className="text-sm font-medium">Zero-fee trading of vaulted assets</p>
                        </div>
                    </div>

                    {error && <p className="text-red-400 text-sm">{error}</p>}

                    <div className="flex flex-col space-y-4 pt-4">
                        <button
                            onClick={handleConnect}
                            disabled={isSubmitting}
                            className="w-full bg-white text-black hover:bg-zinc-100 py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center space-x-2"
                        >
                            {isSubmitting ? (
                                <span>Redirecting to Stripe...</span>
                            ) : (
                                <>
                                    <span>Setup Financial Wallet</span>
                                    <ChevronRight className="h-5 w-5" />
                                </>
                            )}
                        </button>

                        <button
                            onClick={() => router.push(searchParams.get("returnTo") || "/portfolio")}
                            className="w-full text-zinc-500 hover:text-white py-2 text-sm transition-colors"
                        >
                            I'll do this later
                        </button>
                    </div>
                </motion.div>
            </div>

            {/* Right Pane - Visuals (hidden on mobile) */}
            <div className="hidden lg:flex flex-1 relative bg-zinc-900 border-l border-zinc-800 items-center justify-center overflow-hidden">
                {/* Dynamic Background Elements */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[100px]" />
                    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[100px]" />
                </div>

                {/* Decorative holographic card visual */}
                <div className="relative z-10 w-72 h-96 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/0 backdrop-blur-sm shadow-2xl overflow-hidden flex items-center justify-center group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <div className="w-24 h-24 rounded-full border border-white/20 flex items-center justify-center">
                        <span className="text-white/40 font-mono text-xs tracking-widest">tash.</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
