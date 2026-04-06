"use client";

import { useEffect, useMemo, useState } from "react";
import { holdingImageCandidates, holdingNamePlaceholder } from "@/lib/holding-image";
import type { AssetData } from "@/lib/market-data";
import type { VaultHolding } from "@/lib/vault-data";

type HoldingImageProps = {
  holding: VaultHolding;
  assets: AssetData[];
  width: number;
  height: number;
  borderRadius?: number;
  className?: string;
  style?: React.CSSProperties;
  background?: string;
};

/**
 * Vault / portfolio thumbnails: native <img> (avoids next/image + mobile Safari issues on remote URLs),
 * cascades through catalog + fallbacks, then a short text placeholder.
 */
export function HoldingImage({
  holding,
  assets,
  width,
  height,
  borderRadius = 4,
  className,
  style,
  background = "#1a1a1a",
}: HoldingImageProps) {
  const candidates = useMemo(() => holdingImageCandidates(holding, assets), [holding, assets]);
  const canon = candidates.join("\0");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [canon]);

  const placeholder = useMemo(() => holdingNamePlaceholder(holding), [holding]);

  if (idx >= candidates.length) {
    return (
      <div
        className={className}
        style={{
          width,
          height,
          borderRadius,
          background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.max(10, Math.round(Math.min(width, height) * 0.26)),
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: "rgba(255,255,255,0.55)",
          overflow: "hidden",
          ...style,
        }}
        aria-hidden
      >
        {placeholder}
      </div>
    );
  }

  const src = candidates[idx]!;

  return (
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      className={className}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius,
        background,
        ...style,
      }}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
