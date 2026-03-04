"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, Gamepad2, TrendingUp, Search, UserCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { apiPatch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function OnboardingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { session, user } = useAuth();

    // Initialize step from URL if present
    const stepParam = searchParams.get("step");
    const [step, setStep] = useState(stepParam ? parseInt(stepParam) : 1);

    // Sync step state if URL parameter changes
    useEffect(() => {
        const currentStep = searchParams.get("step");
        if (currentStep) {
            setStep(parseInt(currentStep));
        }
    }, [searchParams]);

    // Form State
    const [username, setUsername] = useState("");
    const [favoriteTcgs, setFavoriteTcgs] = useState<string[]>([]);
    const [primaryGoals, setPrimaryGoals] = useState<string[]>([]);

    // UI State
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { refreshProfile } = useAuth();

    // Auto-refresh profile if returning from Stripe
    useEffect(() => {
        const status = searchParams.get("status");
        if (status === "success" || status === "refresh") {
            refreshProfile();
        }
    }, [searchParams, refreshProfile]);

    // If user is already fully onboarded, redirect them away
    useEffect(() => {
        if (
            user?.username &&
            user?.favoriteTcgs?.length > 0 &&
            (user?.primaryGoal?.length ?? 0) > 0 &&
            user?.onboardingComplete
        ) {
            const returnTo = searchParams.get("returnTo");
            router.push(returnTo || "/portfolio");
        }
    }, [user, router, searchParams]);

    // Require session, redirect otherwise after short delay
    useEffect(() => {
        if (!session) {
            const timer = setTimeout(() => {
                if (!session) router.push("/sign-up");
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [session, router]);

    const toggleTcg = (tcg: string) => {
        setFavoriteTcgs(prev =>
            prev.includes(tcg)
                ? prev.filter(t => t !== tcg)
                : [...prev, tcg]
        );
    };

    const handleComplete = async () => {
        if (!session?.user?.id) return;

        setIsSubmitting(true);
        setError(null);

        try {
            await apiPatch("/api/user/profile", {
                username,
                favorite_tcgs: favoriteTcgs,
                primary_goal: primaryGoals,
            });

            // Success - redirect to dashboard/portfolio
            const returnTo = searchParams.get("returnTo");
            router.push(returnTo || "/portfolio");
            router.refresh();
        } catch (err: unknown) {
            console.error(err);
            const msg = err instanceof Error ? err.message : "";
            if (msg.includes("23505") || msg.includes("already taken")) {
                setError("That username is already taken. Please choose another.");
            } else {
                setError("Failed to save profile. Please try again.");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const nextStep = () => {
        if (step === 1 && !username.trim()) {
            setError("Please enter a username.");
            return;
        }
        if (step === 2 && favoriteTcgs.length === 0) {
            setError("Please select at least one TCG.");
            return;
        }
        setError(null);
        setStep(s => s + 1);
    };

    const prevStep = () => {
        setError(null);
        setStep(s => s - 1);
    };

    return (
        <div className="min-h-screen bg-black text-white flex">
            {/* Left Pane - Form/Content */}
            <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24 xl:px-32 relative z-10 w-full max-w-2xl mx-auto lg:mx-0">

                {/* Progress Dots */}
                {step >= 1 && (
                    <div className="absolute top-12 left-8 sm:left-16 lg:left-24 flex items-center space-x-2">
                        {[1, 2, 3, 4].map((i) => (
                            <div
                                key={i}
                                className={`h-1.5 rounded-full transition-all duration-300 ${step >= i ? "w-8 bg-blue-500" : "w-4 bg-zinc-800"
                                    }`}
                            />
                        ))}
                    </div>
                )}

                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            className="space-y-8"
                        >
                            <div>
                                <h2 className="text-3xl font-bold mb-2">Claim your identity</h2>
                                <p className="text-zinc-400">Choose a unique username for your collector profile.</p>
                            </div>

                            <div className="space-y-4">
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <UserCircle2 className="h-5 w-5 text-zinc-500" />
                                    </div>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                        placeholder="username"
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-12 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                                        maxLength={20}
                                    />
                                </div>
                                {error && <p className="text-red-400 text-sm">{error}</p>}
                                <p className="text-zinc-500 text-sm">Use letters, numbers, and underscores only.</p>
                            </div>

                            <div className="flex justify-between pt-4">
                                <div /> {/* Placeholder for flex spacing */}
                                <button
                                    onClick={nextStep}
                                    className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-medium transition-colors"
                                >
                                    <span>Next</span>
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            className="space-y-8"
                        >
                            <div>
                                <h2 className="text-3xl font-bold mb-2">What do you collect?</h2>
                                <p className="text-zinc-400">Select the TCGs you're most interested in tracking and trading.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { id: "pokemon", name: "Pokémon", color: "from-yellow-500/20 to-yellow-600/20", border: "hover:border-yellow-500/50" },
                                    { id: "mtg", name: "Magic: The Gathering", color: "from-amber-700/20 to-amber-900/20", border: "hover:border-amber-700/50" },
                                    { id: "yugioh", name: "Yu-Gi-Oh!", color: "from-indigo-500/20 to-indigo-700/20", border: "hover:border-indigo-500/50" },
                                    { id: "lorcana", name: "Lorcana", color: "from-purple-500/20 to-purple-700/20", border: "hover:border-purple-500/50" },
                                    { id: "sports", name: "Sports", color: "from-red-500/20 to-red-700/20", border: "hover:border-red-500/50" },
                                    { id: "other", name: "Other", color: "from-zinc-500/20 to-zinc-700/20", border: "hover:border-zinc-500/50" }
                                ].map((tcg) => (
                                    <button
                                        key={tcg.id}
                                        onClick={() => toggleTcg(tcg.id)}
                                        className={`relative overflow-hidden p-6 rounded-2xl border text-left transition-all duration-200 ${favoriteTcgs.includes(tcg.id)
                                            ? "border-blue-500 bg-blue-500/10"
                                            : `border-zinc-800 bg-zinc-900/50 ${tcg.border}`
                                            }`}
                                    >
                                        <div className={`absolute inset-0 bg-gradient-to-br ${tcg.color} opacity-0 hover:opacity-100 transition-opacity`} />
                                        <span className="relative z-10 font-medium">{tcg.name}</span>
                                    </button>
                                ))}
                            </div>

                            {error && <p className="text-red-400 text-sm">{error}</p>}

                            <div className="flex justify-between pt-4">
                                <button
                                    onClick={prevStep}
                                    className="flex items-center space-x-2 text-zinc-400 hover:text-white px-4 py-3 rounded-xl font-medium transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    <span>Back</span>
                                </button>
                                <button
                                    onClick={nextStep}
                                    className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-medium transition-colors"
                                >
                                    <span>Next</span>
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div
                            key="step4"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="space-y-8"
                        >
                            <div>
                                <h2 className="text-3xl font-bold mb-2">What brings you here?</h2>
                                <p className="text-zinc-400">Help us personalize your experience.</p>
                            </div>

                            <div className="space-y-4">
                                {[
                                    { id: "portfolio", title: "Tracking Portfolio", desc: "I want to track the value of my collection.", icon: TrendingUp },
                                    { id: "trading", title: "Trading & Flipping", desc: "I'm looking to buy, sell, and trade cards.", icon: Gamepad2 },
                                    { id: "scanning", title: "Scanning Collection", desc: "I just want to digitize my physical cards.", icon: Search },
                                ].map((goal) => {
                                    const Icon = goal.icon;
                                    const isSelected = primaryGoals.includes(goal.id);
                                    return (
                                        <button
                                            key={goal.id}
                                            onClick={() => setPrimaryGoals(prev => prev.includes(goal.id) ? prev.filter(g => g !== goal.id) : [...prev, goal.id])}
                                            className={`w-full flex items-center p-4 rounded-xl border transition-all text-left ${isSelected
                                                ? "border-blue-500 bg-blue-500/10"
                                                : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600"
                                                }`}
                                        >
                                            <div className={`p-3 rounded-lg mr-4 ${isSelected ? "bg-blue-500/20 text-blue-400" : "bg-zinc-800 text-zinc-400"}`}>
                                                <Icon className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-white">{goal.title}</div>
                                                <div className="text-sm text-zinc-500">{goal.desc}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {error && <p className="text-red-400 text-sm">{error}</p>}

                            <div className="flex justify-between pt-4">
                                <button
                                    onClick={prevStep}
                                    className="flex items-center space-x-2 text-zinc-400 hover:text-white px-4 py-3 rounded-xl font-medium transition-colors"
                                    disabled={isSubmitting}
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    <span>Back</span>
                                </button>
                                <button
                                    onClick={handleComplete}
                                    disabled={primaryGoals.length === 0 || isSubmitting}
                                    className={`flex items-center space-x-2 px-8 py-3 rounded-xl font-medium transition-colors ${primaryGoals.length === 0 || isSubmitting
                                        ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                        : "bg-white text-black hover:bg-zinc-200"
                                        }`}
                                >
                                    <span>{isSubmitting ? "Saving..." : "Next"}</span>
                                    {!isSubmitting && <ChevronRight className="w-4 h-4" />}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 4 && (
                        <motion.div
                            key="step5"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="space-y-8"
                        >
                            <div>
                                <h1 className="text-3xl font-bold mb-4">Final Step: Connect your Wallet</h1>
                                <p className="text-zinc-400 text-lg leading-relaxed">
                                    To buy, sell, and withdraw funds on Tash, you need to connect your financial account via Stripe.
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
                                    onClick={async () => {
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
                                    }}
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
                    )}
                </AnimatePresence>
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
                        <span className="text-white/40 font-mono text-xs tracking-widest">TASH</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
