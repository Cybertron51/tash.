"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, Shield, LogOut, ChevronRight, Bell, CreditCard, Wallet, Key, Trash2, AlertTriangle, X, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePortfolio } from "@/lib/portfolio-context";
import { colors, layout } from "@/lib/theme";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

export default function AccountPage() {
  const { user, isAuthenticated, signOut, session } = useAuth();
  const { holdings } = usePortfolio();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    signOut();
    router.push("/");
  }

  async function handleDeleteAccount() {
    if (!session?.access_token) return;

    try {
      const res = await fetch("/api/user/delete", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to delete account");
      }

      signOut();
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Delete account error:", err);
      alert("Failed to delete account. Please try again.");
    }
  }

  if (!isAuthenticated || !user) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4"
        style={{ minHeight: `calc(100dvh - ${layout.chromeHeight})`, background: colors.background }}
      >
        <p className="text-[14px]" style={{ color: colors.textMuted }}>
          Sign in to view your account
        </p>
        <Link
          href="/"
          className="rounded-[10px] px-5 py-[10px] text-[13px] font-semibold"
          style={{ background: colors.green, color: colors.textInverse }}
        >
          Go to Market
        </Link>
      </div>
    );
  }

  const menuSections = [
    {
      title: "Account",
      items: [
        {
          icon: <CreditCard size={15} />,
          label: "Deposit Funds",
          sub: "Add money to your balance",
          href: "/deposit",
        },
        {
          icon: <Wallet size={15} />,
          label: "Withdraw Funds",
          sub: "Transfer money to your bank",
          href: "/withdraw",
        },
        {
          icon: <Key size={15} />,
          label: "Change Password",
          sub: "Update your account password",
          href: "/change-password",
        },
      ],
    },
  ];

  return (
    <div
      className="mx-auto max-w-xl px-4 py-8"
      style={{ minHeight: `calc(100dvh - ${layout.chromeHeight})`, background: colors.background }}
    >
      {/* Profile card */}
      <div
        className="mb-6 flex items-center gap-4 rounded-[14px] border p-5"
        style={{ borderColor: colors.border, background: colors.surface }}
      >
        {/* Avatar */}
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[20px] font-black"
          style={{ background: colors.green, color: colors.textInverse }}
        >
          {user.initials}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold" style={{ color: colors.textPrimary }}>
            {user.name}
          </p>
          <div className="mt-[2px] flex items-center gap-1">
            <Mail size={11} style={{ color: colors.textMuted }} />
            <p className="text-[12px]" style={{ color: colors.textMuted }}>
              {user.email}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
            Balance
          </p>
          <p className="tabular-nums text-[18px] font-bold" style={{ color: colors.textPrimary }}>
            {formatCurrency(user.cashBalance)}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div
        className="mb-6 grid grid-cols-3 overflow-hidden rounded-[12px] border"
        style={{ borderColor: colors.border, background: colors.surface }}
      >
        {[
          { label: "Available", value: formatCurrency(user.cashBalance) },
          { label: "Holdings", value: `${holdings.filter(h => h.status !== "withdrawn").length} cards` },
          { label: "Member Since", value: user.memberSince },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="flex flex-col gap-[3px] px-4 py-3"
            style={{ borderRight: i < 2 ? `1px solid ${colors.border}` : undefined }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
              {stat.label}
            </span>
            <span className="tabular-nums text-[13px] font-semibold" style={{ color: colors.textPrimary }}>
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* Menu sections */}
      {menuSections.map((section) => (
        <div key={section.title} className="mb-5">
          <p
            className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: colors.textMuted }}
          >
            {section.title}
          </p>
          <div
            className="overflow-hidden rounded-[12px] border"
            style={{ borderColor: colors.border, background: colors.surface }}
          >
            {section.items.map((item, i) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 px-4 py-[14px] transition-colors hover:bg-[#2a2a2a]"
                style={{ borderBottom: i < section.items.length - 1 ? `1px solid ${colors.border}` : undefined }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"
                  style={{ background: colors.surfaceOverlay, color: colors.textSecondary }}
                >
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold" style={{ color: colors.textPrimary }}>
                    {item.label}
                  </p>
                  <p className="text-[11px]" style={{ color: colors.textMuted }}>
                    {item.sub}
                  </p>
                </div>
                <ChevronRight size={14} style={{ color: colors.textMuted }} />
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* Account info */}
      <div
        className="mb-5 overflow-hidden rounded-[12px] border"
        style={{ borderColor: colors.border, background: colors.surface }}
      >
        <div className="flex items-center gap-3 px-4 py-[14px]" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"
            style={{ background: colors.surfaceOverlay, color: colors.textSecondary }}
          >
            <User size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold" style={{ color: colors.textPrimary }}>User ID</p>
            <p className="truncate text-[11px] font-mono" style={{ color: colors.textMuted }}>
              {user.id}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-[14px]">
          <div>
            <p className="text-[13px] font-semibold" style={{ color: colors.textPrimary }}>Email</p>
            <p className="text-[11px]" style={{ color: colors.textMuted }}>{user.email}</p>
          </div>
          <div
            className="rounded-full px-2 py-[3px] text-[10px] font-bold"
            style={{ background: colors.greenMuted, color: colors.green, border: `1px solid ${colors.green}33` }}
          >
            Verified
          </div>
        </div>
      </div>

      {/* Sign out */}
      <div className="flex flex-col gap-3">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex w-full items-center justify-center gap-2 rounded-[12px] py-[12px] text-[13px] font-semibold transition-colors hover:bg-[#1a0000]"
          style={{ border: `1px solid ${colors.border}`, color: colors.textSecondary, background: "transparent" }}
        >
          <LogOut size={14} />
          {signingOut ? "Signing out…" : "Sign Out"}
        </button>

        <button
          onClick={() => setShowDeleteModal(true)}
          className="flex w-full items-center justify-center gap-2 rounded-[12px] py-[12px] text-[13px] font-semibold transition-colors hover:bg-[#1a0000]"
          style={{ border: `1px solid ${colors.red}44`, color: colors.red, background: "transparent" }}
        >
          <Trash2 size={14} />
          Delete Account
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
        >
          <div
            className="w-full max-w-sm rounded-[24px] border p-6"
            style={{ background: colors.surface, borderColor: colors.border }}
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
              <AlertTriangle size={24} />
            </div>

            <h3 className="mb-2 text-[18px] font-bold" style={{ color: colors.textPrimary }}>
              Delete Account?
            </h3>
            <p className="mb-6 text-[14px] leading-relaxed" style={{ color: colors.textSecondary }}>
              This action is permanent. All your data, including your balance of <b>{formatCurrency(user.cashBalance)}</b> and your card holdings, will be permanently deleted.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleDeleteAccount}
                className="flex w-full items-center justify-center rounded-[12px] py-[12px] text-[14px] font-bold transition-all active:scale-[0.98]"
                style={{ background: colors.red, color: colors.textInverse }}
              >
                Permanently Delete
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex w-full items-center justify-center rounded-[12px] py-[12px] text-[14px] font-semibold transition-colors hover:bg-[#222]"
                style={{ color: colors.textSecondary }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
