"use client";

import { X, MapPin, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { colors, zIndex } from "@/lib/theme";

interface SubmitModalProps {
  onClose: () => void;
  preSelectedHoldingId?: string;
}

export function SubmitModal({ onClose, preSelectedHoldingId }: SubmitModalProps) {
  const router = useRouter();

  function handleSelect(path: string) {
    onClose();
    const url = preSelectedHoldingId ? `${path}?selected=${preSelectedHoldingId}` : path;
    router.push(url);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: zIndex.modal,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 16,
          width: 520,
          maxWidth: "100%",
          padding: 28,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 700 }}>Submit to tash.</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: 4, display: "flex", alignItems: "center" }}
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24 }}>
          Choose how you'd like to submit your cards for vaulting.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Drop-Off */}
          <button
            onClick={() => handleSelect("/drop-off")}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 16,
              padding: 20,
              borderRadius: 12,
              border: `1px solid ${colors.border}`,
              background: colors.surfaceOverlay,
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = colors.green;
              e.currentTarget.style.background = `${colors.green}08`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = colors.border;
              e.currentTarget.style.background = colors.surfaceOverlay;
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: colors.greenMuted,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <MapPin size={22} style={{ color: colors.green }} />
            </div>
            <div>
              <p style={{ color: colors.textPrimary, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Drop-Off</p>
              <p style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 1.55 }}>
                Dropping off your cards at one of our trusted handlers at a cardshow or one of our weekly drop-off events allows your cards to be securely transferred by our trusted team, allowing for it to be traded almost immediately.
              </p>
            </div>
          </button>

          {/* Shipping */}
          <button
            onClick={() => handleSelect("/shipping")}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 16,
              padding: 20,
              borderRadius: 12,
              border: `1px solid ${colors.border}`,
              background: colors.surfaceOverlay,
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = colors.green;
              e.currentTarget.style.background = `${colors.green}08`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = colors.border;
              e.currentTarget.style.background = colors.surfaceOverlay;
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: colors.greenMuted,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Truck size={22} style={{ color: colors.green }} />
            </div>
            <div>
              <p style={{ color: colors.textPrimary, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Shipping</p>
              <p style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 1.55 }}>
                Shipping your cards to our storage site allows you to flexibly trade your cards from anywhere, with a small shipping fee.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
