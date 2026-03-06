"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

export default function AuthCallbackPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleCallback = async () => {
            if (!supabase) {
                setError("Supabase client is not available.");
                return;
            }
            try {
                // Wait for Supabase to parse the URL hash and establish the session
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();

                if (sessionError) {
                    throw sessionError;
                }

                if (!session?.user) {
                    // No session established, send back to login
                    router.push("/sign-up");
                    return;
                }

                // Fetch the user's profile to check onboarding status
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('username, favorite_tcgs, primary_goal, onboarding_complete')
                    .eq('id', session.user.id)
                    .single();

                if (profileError && profileError.code !== 'PGRST116') {
                    // PGRST116 means no rows found, which is fine for brand new users (though our DB trigger should create one)
                    throw profileError;
                }

                // Check if they have finished the required identity steps
                if (
                    profile?.username &&
                    profile?.favorite_tcgs?.length > 0 &&
                    (Array.isArray(profile?.primary_goal) ? profile.primary_goal.length > 0 : !!profile?.primary_goal)
                ) {
                    const returnTo = searchParams.get("returnTo");
                    router.push(returnTo || "/portfolio");
                } else {
                    router.push("/onboarding");
                }
            } catch (err: any) {
                console.error("Auth callback error:", err);
                setError(err.message || "An error occurred during authentication.");
            }
        };

        handleCallback();
    }, [router]);

    if (error) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4">
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 max-w-md text-center">
                    <h2 className="text-xl font-bold text-red-500 mb-2">Authentication Error</h2>
                    <p className="text-zinc-400 text-sm mb-6">{error}</p>
                    <button
                        onClick={() => router.push("/sign-up")}
                        className="px-6 py-2 bg-white text-black rounded-lg font-medium hover:bg-zinc-200 transition-colors"
                    >
                        Return to Sign In
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
            <div className="flex flex-col items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1E1E1E]">
                    <span className="text-2xl font-black" style={{ color: colors.green }}>t</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="font-medium text-sm tracking-wide">Securing connection...</span>
                </div>
            </div>
        </div>
    );
}
