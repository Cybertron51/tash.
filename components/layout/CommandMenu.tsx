"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search, Loader2 } from "lucide-react";
import { colors } from "@/lib/theme";
import { formatCurrency } from "@/lib/utils";
import Image from "next/image";

interface CardResult {
    id: string;
    symbol: string;
    name: string;
    set_name: string;
    psa_grade: number;
    image_url: string | null;
    price: number | null;
}

export function CommandMenu({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<CardResult[]>([]);
    const [loading, setLoading] = useState(false);

    // Toggle the menu when ⌘K is pressed
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen(!open);
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, [setOpen]);

    // Fetch search results from our API Route
    const fetchResults = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setResults([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
            if (res.ok) {
                const data = await res.json();
                setResults(data.results || []);
            }
        } catch (error) {
            console.error("Search failed:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounce the search input
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchResults(query);
        }, 300);

        return () => clearTimeout(timer);
    }, [query, fetchResults]);

    const handleSelect = (symbol: string) => {
        setOpen(false);
        router.push(`/market?symbol=${symbol}`);
        setQuery("");
        setResults([]);
    };

    return (
        <Command.Dialog
            open={open}
            onOpenChange={setOpen}
            label="Global Command Menu"
            className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-4"
        >
            {/* Backdrop */}
            <div
                className="fixed inset-0"
                style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
                onClick={() => setOpen(false)}
            />

            {/* Menu Container */}
            <div
                className="relative w-full max-w-[600px] overflow-hidden rounded-[16px] shadow-2xl border flex flex-col"
                style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
                }}
            >
                {/* Search Input Area */}
                <div className="flex items-center border-b px-4 py-3" style={{ borderColor: colors.borderSubtle }}>
                    <Search className="mr-3 h-5 w-5 opacity-50 shrink-0" style={{ color: colors.textSecondary }} />
                    <Command.Input
                        autoFocus
                        value={query}
                        onValueChange={setQuery}
                        placeholder="Search cards by name, set, or symbol..."
                        className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-zinc-500"
                        style={{ color: colors.textPrimary }}
                    />
                    {loading && <Loader2 className="ml-3 h-5 w-5 animate-spin opacity-50 shrink-0" style={{ color: colors.textSecondary }} />}
                    <div className="ml-3 rounded-md px-2 py-1 text-[10px] font-semibold tracking-widest hidden sm:block"
                        style={{ backgroundColor: colors.surfaceOverlay, color: colors.textSecondary }}>
                        ESC
                    </div>
                </div>

                {/* Results List */}
                <Command.List className="max-h-[300px] overflow-y-auto p-2 overscroll-contain">
                    <Command.Empty className="py-6 text-center text-[13px]" style={{ color: colors.textSecondary }}>
                        {query.trim() === "" ? "Type to search for trading cards..." : "No cards found."}
                    </Command.Empty>

                    {results.map((card) => (
                        <Command.Item
                            key={card.id}
                            value={card.name + " " + card.symbol + " " + card.set_name} // Search indexing on frontend
                            onSelect={() => handleSelect(card.symbol)}
                            className="flex cursor-pointer items-center justify-between gap-3 rounded-[10px] px-3 py-3 transition-colors aria-selected:bg-[#2A2A2A]"
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                {/* Card Thumbnail */}
                                <div className="h-10 w-8 shrink-0 overflow-hidden rounded-sm bg-[#1E1E1E]">
                                    {card.image_url && (
                                        <Image
                                            src={card.image_url}
                                            alt={card.name}
                                            width={32}
                                            height={40}
                                            className="h-full w-full object-cover"
                                            unoptimized // For external URLs
                                        />
                                    )}
                                </div>

                                <div className="flex flex-col overflow-hidden">
                                    <span className="truncate text-[14px] font-semibold" style={{ color: colors.textPrimary }}>
                                        {card.name}
                                    </span>
                                    <span className="truncate text-[12px]" style={{ color: colors.textSecondary }}>
                                        {card.set_name} • PSA {card.psa_grade}
                                    </span>
                                </div>
                            </div>

                            {/* Price / Symbol */}
                            <div className="flex flex-col items-end shrink-0">
                                <span className="text-[13px] font-bold tabular-nums" style={{ color: colors.textPrimary }}>
                                    {card.price ? formatCurrency(card.price) : "---"}
                                </span>
                                <span className="text-[10px] uppercase font-semibold" style={{ color: colors.textMuted }}>
                                    {card.symbol}
                                </span>
                            </div>
                        </Command.Item>
                    ))}
                </Command.List>
            </div>
        </Command.Dialog>
    );
}

// Add these global styles for cmdk animations and hiding the default dialog UI if necessary
// This can technically live in globals.css, but Next.js + Tailwind sometimes strip cmdk classes
typeof document !== 'undefined' && (() => {
    const style = document.createElement("style");
    style.innerHTML = `
      [cmdk-dialog] {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 200;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 15vh;
      }
      [cmdk-overlay] {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
        z-index: 199;
      }
    `;
    document.head.appendChild(style);
})();
