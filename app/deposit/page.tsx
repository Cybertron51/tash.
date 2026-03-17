"use client";

/**
 * TASH — Deposit Funds Page
 *
 * 3-stage flow:
 *   1. amount  — Preset pills + custom input
 *   2. payment — Stripe Payment Element (card / Apple Pay / Google Pay)
 *   3. success — Balance confirmed, link to trading
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { CheckCircle, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import { colors, layout } from "@/lib/theme";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

// ─────────────────────────────────────────────────────────
// Stripe.js singleton
// ─────────────────────────────────────────────────────────

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// ─────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────

type Stage = "amount" | "payment" | "success";

const PRESETS = [50, 100, 250, 500, 1_000, 2_500];
const MIN = 1;
const MAX = 10_000;

const ELEMENTS_APPEARANCE = {
  theme: "night" as const,
  variables: {
    colorPrimary: colors.green,
    colorBackground: colors.surface,
    colorText: colors.textPrimary,
    colorTextSecondary: colors.textSecondary,
    colorTextPlaceholder: colors.textMuted,
    colorDanger: colors.red,
    borderRadius: "10px",
    fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
    fontSizeBase: "14px",
    spacingUnit: "4px",
    spacingGridRow: "16px",
  },
  rules: {
    ".Input": {
      border: `1px solid ${colors.border}`,
      boxShadow: "none",
      padding: "12px 14px",
    },
    ".Input:focus": {
      border: `1px solid ${colors.green}`,
      boxShadow: "none",
    },
    ".Label": {
      fontWeight: "600",
      fontSize: "12px",
      textTransform: "uppercase" as const,
      letterSpacing: "0.04em",
      color: colors.textSecondary,
    },
    ".Tab": {
      border: `1px solid ${colors.border}`,
      backgroundColor: colors.surface,
    },
    ".Tab--selected": {
      border: `1px solid ${colors.green}`,
      backgroundColor: colors.greenMuted,
    },
  },
};

// ─────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────

export default function DepositPage() {
  const [stage, setStage] = useState<Stage>("amount");
  const [amount, setAmount] = useState<number | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user, refreshProfile } = useAuth();

  // Amount → create PaymentIntent → show payment form
  const handleContinue = useCallback(async (amt: number) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/deposit/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents: Math.round(amt * 100),
          userId: user?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to initialize payment");
        return;
      }
      setAmount(amt);
      setClientSecret(data.clientSecret);
      setStage("payment");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handlePaymentSuccess = useCallback(() => {
    setStage("success");
    setTimeout(() => refreshProfile(), 1500);
  }, [refreshProfile]);

  const handleBack = useCallback(() => {
    setStage("amount");
    setClientSecret(null);
    setError(null);
  }, []);

  // ─────────────────────────────────────────────────────────
  // Layout
  // ─────────────────────────────────────────────────────────

  const pageStyle: React.CSSProperties = {
    minHeight: `calc(100dvh - ${layout.chromeHeight})`,
    background: colors.background,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 480,
    padding: "0 16px 40px",
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
          {stage === "amount" && (
            <AmountStage
              onContinue={handleContinue}
              loading={loading}
              error={error}
            />
          )}

          {stage === "payment" && clientSecret && amount != null && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: ELEMENTS_APPEARANCE,
              }}
            >
              <PaymentStage
                amount={amount}
                onSuccess={handlePaymentSuccess}
                onBack={handleBack}
              />
            </Elements>
          )}

          {stage === "success" && amount != null && (
            <SuccessStage
              amount={amount}
              balance={user?.cashBalance ?? 0}
              onDepositMore={() => {
                setAmount(null);
                setClientSecret(null);
                setError(null);
                setStage("amount");
              }}
            />
          )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Stage 1 — Amount
// ─────────────────────────────────────────────────────────

function AmountStage({
  onContinue,
  loading,
  error,
}: {
  onContinue: (amount: number) => void;
  loading: boolean;
  error: string | null;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function getAmount(): number | null {
    if (custom !== "") {
      const val = parseFloat(custom.replace(/[^0-9.]/g, ""));
      return isNaN(val) ? null : val;
    }
    return selected;
  }

  function validate(): boolean {
    const amt = getAmount();
    if (amt == null) {
      setValidationError("Please select or enter an amount");
      return false;
    }
    if (amt < MIN) {
      setValidationError(`Minimum deposit is ${formatCurrency(MIN)}`);
      return false;
    }
    if (amt > MAX) {
      setValidationError(`Maximum deposit is ${formatCurrency(MAX)}`);
      return false;
    }
    setValidationError(null);
    return true;
  }

  function handleContinue() {
    if (!validate()) return;
    const amt = getAmount()!;
    onContinue(amt);
  }

  function handleCustomChange(val: string) {
    setCustom(val);
    setSelected(null);
    setValidationError(null);
  }

  const displayError = validationError ?? error;
  const amt = getAmount();
  const canContinue = amt != null && amt >= MIN && amt <= MAX && !loading;

  return (
    <>
      {/* Header */}
      <div style={{ paddingTop: 32, paddingBottom: 24 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: colors.textPrimary,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Add Funds
        </h1>
        <p style={{ fontSize: 13, color: colors.textMuted, marginTop: 4, margin: "4px 0 0" }}>
          Available instantly · No fees
        </p>
      </div>

      {/* Error banner */}
      {displayError && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,80,0,0.1)",
            border: `1px solid ${colors.red}44`,
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          <AlertCircle size={14} style={{ color: colors.red, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: colors.red }}>{displayError}</span>
        </div>
      )}

      {/* Preset pills */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {PRESETS.map((preset) => {
          const active = selected === preset && custom === "";
          return (
            <button
              key={preset}
              onClick={() => {
                setSelected(preset);
                setCustom("");
                setValidationError(null);
              }}
              style={{
                padding: "12px 0",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${active ? colors.green : colors.border}`,
                background: active ? colors.greenMuted : colors.surface,
                color: active ? colors.green : colors.textSecondary,
                transition: "all 0.15s",
              }}
            >
              {formatCurrency(preset, { decimals: 0 })}
            </button>
          );
        })}
      </div>

      {/* Custom amount input */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: colors.surface,
          border: `1px solid ${custom !== "" ? colors.green : colors.border}`,
          borderRadius: 10,
          padding: "0 14px",
          marginBottom: 24,
          transition: "border-color 0.15s",
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: custom !== "" ? colors.textPrimary : colors.textMuted,
            marginRight: 4,
            userSelect: "none",
          }}
        >
          $
        </span>
        <input
          type="number"
          inputMode="decimal"
          placeholder="Custom amount"
          value={custom}
          onChange={(e) => handleCustomChange(e.target.value)}
          min={MIN}
          max={MAX}
          style={{
            flex: 1,
            padding: "14px 0",
            fontSize: 16,
            fontWeight: 500,
            background: "transparent",
            border: "none",
            outline: "none",
            color: colors.textPrimary,
            caretColor: colors.green,
          }}
        />
        {custom !== "" && (
          <button
            onClick={() => { setCustom(""); setValidationError(null); }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: colors.textMuted,
              fontSize: 18,
              lineHeight: 1,
              padding: "0 0 0 8px",
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Continue button */}
      <button
        onClick={handleContinue}
        disabled={!canContinue}
        style={{
          width: "100%",
          padding: "14px 0",
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 700,
          cursor: canContinue ? "pointer" : "not-allowed",
          border: "none",
          background: canContinue ? colors.green : colors.surface,
          color: canContinue ? colors.textInverse : colors.textMuted,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          transition: "all 0.15s",
        }}
      >
        {loading ? (
          <>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            Preparing payment…
          </>
        ) : (
          <>Continue {amt != null && amt >= MIN ? `— ${formatCurrency(amt)}` : ""} →</>
        )}
      </button>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Stage 2 — Payment (Stripe Elements)
// ─────────────────────────────────────────────────────────

function PaymentStage({
  amount,
  onSuccess,
  onBack,
}: {
  amount: number;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setError(null);
    setLoading(true);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Validation failed");
      setLoading(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin + "/deposit",
      },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed — please try again");
      setLoading(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      onSuccess();
    } else {
      setError("Payment was not completed. Please try again.");
      setLoading(false);
    }
  }, [stripe, elements, onSuccess]);

  return (
    <>
      {/* Header with back */}
      <div style={{ paddingTop: 32, paddingBottom: 24 }}>
        <button
          onClick={onBack}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "none",
            border: "none",
            color: colors.textSecondary,
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            padding: 0,
            marginBottom: 16,
          }}
        >
          <ArrowLeft size={14} /> Change amount
        </button>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: colors.textPrimary,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Pay {formatCurrency(amount)}
        </h1>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: "4px 0 0" }}>
          Enter your card details below
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,80,0,0.1)",
            border: `1px solid ${colors.red}44`,
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          <AlertCircle size={14} style={{ color: colors.red, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: colors.red }}>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 24 }}>
          <PaymentElement
            options={{
              layout: "tabs",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={!stripe || loading}
          style={{
            width: "100%",
            padding: "14px 0",
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            cursor: !stripe || loading ? "not-allowed" : "pointer",
            border: "none",
            background: !stripe || loading ? colors.surface : colors.green,
            color: !stripe || loading ? colors.textMuted : colors.textInverse,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all 0.15s",
          }}
        >
          {loading ? (
            <>
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              Processing…
            </>
          ) : (
            <>Deposit {formatCurrency(amount)} →</>
          )}
        </button>
      </form>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Stage 3 — Success
// ─────────────────────────────────────────────────────────

function SuccessStage({
  amount,
  balance,
  onDepositMore,
}: {
  amount: number;
  balance: number;
  onDepositMore: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        paddingTop: 60,
        gap: 16,
      }}
    >
      <CheckCircle
        size={64}
        strokeWidth={1.5}
        style={{ color: colors.green }}
      />

      <div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: colors.textPrimary,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          Funds Added
        </h2>
        <p style={{ fontSize: 15, color: colors.textSecondary, marginTop: 8 }}>
          <strong style={{ color: colors.textPrimary }}>{formatCurrency(amount)}</strong>{" "}
          is now available
        </p>
      </div>

      {/* Balance display */}
      <div
        style={{
          background: colors.greenMuted,
          border: `1px solid ${colors.green}44`,
          borderRadius: 12,
          padding: "16px 24px",
          marginTop: 4,
          minWidth: 220,
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: colors.green, margin: "0 0 4px" }}>
          Cash Balance
        </p>
        <p style={{ fontSize: 28, fontWeight: 700, color: colors.textPrimary, margin: 0, letterSpacing: "-0.02em" }}>
          {formatCurrency(balance)}
        </p>
      </div>

      <Link
        href="/"
        style={{
          display: "block",
          width: "100%",
          maxWidth: 340,
          marginTop: 16,
          padding: "14px 0",
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          border: "none",
          background: colors.green,
          color: colors.textInverse,
          textDecoration: "none",
          textAlign: "center",
        }}
      >
        Start Trading →
      </Link>

      <button
        onClick={onDepositMore}
        style={{
          width: "100%",
          maxWidth: 340,
          padding: "12px 0",
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          border: `1px solid ${colors.border}`,
          background: "transparent",
          color: colors.textSecondary,
        }}
      >
        Deposit More
      </button>
    </div>
  );
}
