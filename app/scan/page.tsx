"use client";

/**
 * TASH — Card Scan Page
 *
 * Mobile-first 4-stage flow:
 *   1. Capture  — Camera or Upload tab
 *   2. Analyzing — Blurred preview + spinner while AI identifies the card
 *   3. Result   — Grade estimate, condition grid, confidence bar, "Add to Vault"
 *   4. Confirmed — Success state with link to Portfolio
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Camera,
  Upload,
  CheckCircle,
  RotateCcw,
  Loader2,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { colors, layout } from "@/lib/theme";
import { formatCurrency } from "@/lib/utils";
import { type VaultHolding } from "@/lib/vault-data";
import { insertVaultHolding } from "@/lib/db/vault";

import { useAuth } from "@/lib/auth";
import { SignInModal } from "@/components/auth/SignInModal";
import { usePortfolio } from "@/lib/portfolio-context";
import { v4 as uuidv4 } from "uuid";
import { BrowserMultiFormatReader } from "@zxing/browser";

export interface CardPricing {
  low: string | null;
  mid: string | null;
  high: string | null;
  labels: [string, string, string];
  source: string;
}

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

type Stage = "capture" | "analyzing" | "result" | "confirmed";
type CaptureTab = "camera" | "upload";

interface ConditionDetail {
  corners: string;
  surfaces: string;
  centering: string;
  edges: string;
}

interface ScanResult {
  name: string;
  set: string;
  year: number;
  cardNumber: string | null;
  category: string;
  estimatedGrade: number;
  certNumber?: string;
  gradeRange: [number, number];
  confidence: number;
  condition: ConditionDetail;
  notes: string;
  isFullSlabVisible: boolean;
  rawImageUrl?: string;
}

export interface ScanItem {
  id: string;
  blobUrl: string;
  imageBase64: string;
  mimeType: string;
  thumbDataUrl: string;
  status: "pending" | "analyzing" | "success" | "error";
  result?: ScanResult;
  matchedSymbol?: string | null;
  cardImageUrl?: string | null;
  rawImageUrl?: string | null;
  pricing?: CardPricing | null;
  error?: string;
  selected?: boolean;
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function gradeColor(grade: number): string {
  if (grade >= 10) return colors.green;
  if (grade >= 9) return "#F5C842";
  if (grade >= 8) return colors.textSecondary;
  return colors.red;
}

function conditionDot(value: string): string {
  const v = value.toLowerCase();
  if (v.includes("sharp") || v.includes("clean") || v.includes("well")) return colors.green;
  if (v.includes("slightly") || v.includes("light")) return "#F5C842";
  if (v.includes("heavily") || v.includes("severe")) return colors.red;
  return "#F5C842";
}

function confidenceLabel(c: number): { label: string; color: string } {
  if (c >= 0.85) return { label: "High confidence", color: colors.green };
  if (c >= 0.6) return { label: "Medium confidence", color: "#F5C842" };
  return { label: "Low confidence — review carefully", color: colors.red };
}

/** Resize a canvas snapshot to a small thumbnail data URL for localStorage. */
function makeThumb(canvas: HTMLCanvasElement): string {
  const thumb = document.createElement("canvas");
  const aspect = canvas.height / canvas.width;
  thumb.width = 60;
  thumb.height = Math.round(60 * aspect);
  thumb.getContext("2d")?.drawImage(canvas, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL("image/jpeg", 0.6);
}

// ─────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────

export default function ScanPage() {
  const [stage, setStage] = useState<Stage>("capture");
  const [captureTab, setCaptureTab] = useState<CaptureTab>("camera");

  // Batch state
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [activeScanIndex, setActiveScanIndex] = useState<number>(0);
  const [estimatedValues, setEstimatedValues] = useState<Record<string, number>>({});

  // UI state
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);

  const { user, isAuthenticated } = useAuth();
  const { holdings, addHolding } = usePortfolio();

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Camera management ──────────────────────────────────
  useEffect(() => {
    if (stage === "capture" && captureTab === "camera") {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" } })
        .then((stream) => {
          streamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(() => setCameraError("Camera access denied or unavailable"));
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [stage, captureTab]);

  // ── Capture from camera ────────────────────────────────
  function capturePhoto() {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    const thumb = makeThumb(canvas);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(",")[1];
          const newItem: ScanItem = {
            id: uuidv4(),
            blobUrl: url,
            imageBase64: base64,
            mimeType: "image/jpeg",
            thumbDataUrl: thumb,
            status: "pending",
            selected: true,
          };
          setScans((prev) => [...prev, newItem]);
        };
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      0.88
    );
  }

  // ── Handle file upload ─────────────────────────────────
  function handleFiles(files: FileList | null) {
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      const mime = file.type.startsWith("image/png") ? "image/png" : "image/jpeg";

      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];

        // Build thumb from the image
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext("2d")?.drawImage(img, 0, 0);

          const newItem: ScanItem = {
            id: uuidv4(),
            blobUrl: url,
            imageBase64: base64,
            mimeType: mime,
            thumbDataUrl: makeThumb(canvas),
            status: "pending",
            selected: true,
          };
          setScans((prev) => [...prev, newItem]);
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Auto-analyze Queue ─────────────────────────────────
  // Removed automatic transition. The user now manually triggers onStartAnalysis.
  useEffect(() => {
    const analyzingScans = scans.filter((s) => s.status === "analyzing");

    if (stage === "analyzing") {
      // Only start next if nothing is currently analyzing
      if (analyzingScans.length === 0) {
        // Find the next pending and selected scan
        const nextPendingIndex = scans.findIndex((s) => s.status === "pending" && s.selected !== false);

        if (nextPendingIndex !== -1) {
          setActiveScanIndex(nextPendingIndex);
          analyzeCard(nextPendingIndex);
        } else {
          // If all are done (success or error), move to result stage
          const allDone = scans.every((s) => s.status === "success" || s.status === "error");
          if (allDone && scans.length > 0) {
            setStage("result");
          }
        }
      }
    }
  }, [scans, stage]);

  // ── Analyze individual card ─────────────────────────────
  async function analyzeCard(index: number) {
    const item = scans[index];
    if (!item || item.status !== "pending") return;

    // Mark as analyzing
    setScans((prev) => {
      const newScans = [...prev];
      newScans[index] = { ...item, status: "analyzing" };
      return newScans;
    });

    try {
      // Attempt to read barcode locally first for speed
      let scannedCert: string | undefined;
      try {
        const htmlImageObj = new Image();
        htmlImageObj.src = `data:${item.mimeType};base64,${item.imageBase64}`;
        await new Promise((resolve) => {
          htmlImageObj.onload = resolve;
        });

        // Build a canvas from the image
        const canvas = document.createElement("canvas");
        canvas.width = htmlImageObj.naturalWidth;
        canvas.height = htmlImageObj.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(htmlImageObj, 0, 0);

        const isPSACert = (text: string) => /^\d{7,8}$/.test(text.trim());

        // Helper: create an ImageBitmap from a canvas crop for BarcodeDetector
        async function tryBarcodeDetector(sourceCanvas: HTMLCanvasElement): Promise<string | undefined> {
          if (typeof window === "undefined" || !("BarcodeDetector" in window)) return undefined;
          try {
            // @ts-ignore — BarcodeDetector is not in all TS lib types yet
            const detector = new (window as any).BarcodeDetector({ formats: ["code_128", "code_39", "ean_13", "ean_8", "itf"] });
            const bitmap = await createImageBitmap(sourceCanvas);
            const barcodes = await detector.detect(bitmap);
            for (const barcode of barcodes) {
              if (isPSACert(barcode.rawValue)) return barcode.rawValue.trim();
            }
          } catch { /* BarcodeDetector failed */ }
          return undefined;
        }

        // Helper: try zxing on an image element
        async function tryZxing(imgEl: HTMLImageElement): Promise<string | undefined> {
          try {
            const codeReader = new BrowserMultiFormatReader();
            const result = await codeReader.decodeFromImageElement(imgEl);
            const text = result?.getText();
            if (text && isPSACert(text)) return text.trim();
          } catch { /* zxing failed */ }
          return undefined;
        }

        const tryAllMethods = async (): Promise<string | undefined> => {
          // --- Method 1: BarcodeDetector on full image ---
          let cert = await tryBarcodeDetector(canvas);
          if (cert) { console.log("BarcodeDetector: found on full image"); return cert; }

          // --- Method 2: BarcodeDetector on top 30% crop (PSA label area) ---
          const cropCanvas = document.createElement("canvas");
          const cropHeight = Math.round(canvas.height * 0.30);
          cropCanvas.width = canvas.width;
          cropCanvas.height = cropHeight;
          const cropCtx = cropCanvas.getContext("2d");
          if (cropCtx) {
            cropCtx.drawImage(canvas, 0, 0, canvas.width, cropHeight, 0, 0, canvas.width, cropHeight);
            cert = await tryBarcodeDetector(cropCanvas);
            if (cert) { console.log("BarcodeDetector: found on cropped label"); return cert; }

            // --- Method 3: BarcodeDetector on upscaled crop (2x) ---
            const upCanvas = document.createElement("canvas");
            upCanvas.width = cropCanvas.width * 2;
            upCanvas.height = cropCanvas.height * 2;
            const upCtx = upCanvas.getContext("2d");
            if (upCtx) {
              upCtx.imageSmoothingEnabled = true;
              upCtx.imageSmoothingQuality = "high";
              upCtx.drawImage(cropCanvas, 0, 0, upCanvas.width, upCanvas.height);
              cert = await tryBarcodeDetector(upCanvas);
              if (cert) { console.log("BarcodeDetector: found on upscaled crop"); return cert; }
            }
          }

          // --- Fallback: zxing on full image ---
          cert = await tryZxing(htmlImageObj);
          if (cert) { console.log("zxing: found on full image"); return cert; }

          // --- Fallback: zxing on cropped label ---
          if (cropCtx) {
            const cropImg = new Image();
            cropImg.src = cropCanvas.toDataURL("image/png");
            await new Promise((resolve) => { cropImg.onload = resolve; });
            cert = await tryZxing(cropImg);
            if (cert) { console.log("zxing: found on cropped label"); return cert; }
          }

          return undefined;
        };

        // Timeout after 4 seconds
        const decodeResult = await Promise.race([
          tryAllMethods(),
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 4000)),
        ]);
        scannedCert = decodeResult;
        if (scannedCert) {
          console.log(`Barcode detected locally: ${scannedCert}`);
        } else {
          console.log("No barcode detected locally after all attempts");
        }
      } catch (err) {
        console.log("Barcode detection error:", err);
      }

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: item.imageBase64,
          mimeType: item.mimeType,
          certNumberLocalScan: scannedCert
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");

      // Check if duplicate in current batch
      const isDuplicateInBatch = scans.some((s, i) => i !== index && s.result?.certNumber === data.card.certNumber);

      // We also check against existing portfolio to be safe (client side first pass)
      // `holdings` comes from the top-level usePortfolio hook
      const existingHolding = data.card.certNumber ?
        holdings.find(h => h.certNumber === data.card.certNumber) : null;

      if (isDuplicateInBatch || existingHolding) {
        throw new Error(`Duplicate PSA Certificate: ${data.card.certNumber}`);
      }

      setScans((prev) => {
        const newScans = [...prev];
        newScans[index] = {
          ...newScans[index],
          status: "success",
          result: data.card,
          matchedSymbol: data.matchedSymbol,
          cardImageUrl: data.imageUrl,
          rawImageUrl: data.rawImageUrl,
          pricing: data.pricing,
        };
        return newScans;
      });
    } catch (err: any) {
      setScans((prev) => {
        const newScans = [...prev];
        newScans[index] = {
          ...newScans[index],
          status: "error",
          error: err.message || "An error occurred",
        };
        return newScans;
      });
    }
  }

  // ── Add to vault ───────────────────────────────────────
  async function addToVault() {
    if (!user) return;
    const successfulScans = scans.filter((s) => s.status === "success" && s.result);
    if (successfulScans.length === 0) return;

    for (const item of successfulScans) {
      const result = item.result!;
      const holdingId = uuidv4();
      const finalImageUrl = item.cardImageUrl ?? item.thumbDataUrl ?? "";

      const newHolding: VaultHolding = {
        id: holdingId, // Use the generated UUID
        name: result.name ?? "Unknown Card",
        symbol: item.matchedSymbol ?? `SCAN-${Date.now()}`,
        grade: Math.round(result.estimatedGrade ?? 9),
        set: result.set ?? "Unknown Set",
        year: result.year ?? new Date().getFullYear(),
        acquisitionPrice: estimatedValues[item.id] ?? 0,
        status: "pending_authentication", // Initial state for escrow flow
        dateDeposited: new Date().toISOString().split("T")[0],
        certNumber: result.certNumber ?? "Pending grading",
        imageUrl: finalImageUrl,
        rawImageUrl: item.rawImageUrl ?? undefined,
      };

      try {
        // 1. Save to Supabase DB using our helper — include card metadata for catalog auto-creation
        const dbRes: any = await insertVaultHolding(newHolding, undefined, {
          name: result.name,
          category: result.category,
          set: result.set,
          year: result.year,
          grade: Math.round(result.estimatedGrade ?? 9),
          cardNumber: result.cardNumber,
        });

        if (dbRes && dbRes.id) {
          newHolding.id = dbRes.id;
        }

        // 2. Update local context immediately
        addHolding(newHolding);
      } catch (e) {
        console.error("Failed to add to vault:", e);
      }
    }

    setStage("confirmed");
  }

  // ── Reset to scan again ────────────────────────────────
  function reset() {
    scans.forEach((s) => URL.revokeObjectURL(s.blobUrl));
    setScans([]);
    setActiveScanIndex(0);
    setGlobalError(null);
    setCameraError(null);
    setStage("capture");
  }

  // ─────────────────────────────────────────────────────────
  // Render
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

  if (!isAuthenticated) {
    return (
      <div style={pageStyle}>
        <div
          className="flex flex-col items-center justify-center gap-4"
          style={{ minHeight: `calc(100dvh - ${layout.chromeHeight})`, width: "100%" }}
        >
          <div style={{ padding: 32, borderRadius: 16, border: `1px solid ${colors.border}`, background: colors.surface, textAlign: "center", maxWidth: 400 }}>
            <h2 style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sign In Required</h2>
            <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24 }}>You must be logged in to scan and upload cards.</p>
            <button
              onClick={() => setShowSignIn(true)}
              style={{ width: "100%", background: colors.green, color: colors.background, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", transition: "transform 0.15s" }}
              onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.98)"}
              onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
              onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            >
              Sign In / Sign Up
            </button>
          </div>
          {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* ── Stage 1: Capture ── */}
        {stage === "capture" && (
          <CaptureStage
            captureTab={captureTab}
            setCaptureTab={(tab) => {
              setCaptureTab(tab);
              setCameraError(null);
            }}
            scans={scans}
            error={globalError}
            cameraError={cameraError}
            onStartAnalysis={() => setStage("analyzing")}
            dragOver={dragOver}
            videoRef={videoRef}
            fileInputRef={fileInputRef}
            onCapture={capturePhoto}
            onFiles={handleFiles}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onSwitchToUpload={() => { setCaptureTab("upload"); setCameraError(null); }}
            onToggleSelection={(id) => {
              setScans(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
            }}
          />
        )}

        {/* ── Stage 2: Analyzing ── */}
        {stage === "analyzing" && scans[activeScanIndex] && (
          <AnalyzingStage scans={scans} activeIndex={activeScanIndex} />
        )}

        {/* ── Stage 3: Result ── */}
        {stage === "result" && (
          <ResultStage
            scans={scans}
            onAddToVault={addToVault}
            onScanAgain={reset}
            estimatedValues={estimatedValues}
            onSetEstimatedValue={(id, val) => setEstimatedValues(prev => ({ ...prev, [id]: val }))}
          />
        )}

        {/* ── Stage 4: Confirmed ── */}
        {stage === "confirmed" && (
          <ConfirmedStage totalCount={scans.filter(s => s.status === "success" && s.result?.certNumber && s.result?.isFullSlabVisible).length} onScanAgain={reset} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Stage 1 — Capture
// ─────────────────────────────────────────────────────────

interface CaptureStageProps {
  captureTab: CaptureTab;
  setCaptureTab: (t: CaptureTab) => void;
  scans: ScanItem[];
  error: string | null;
  cameraError: string | null;
  onStartAnalysis: () => void;
  dragOver: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onCapture: () => void;
  onFiles: (files: FileList | null) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onSwitchToUpload: () => void;
  onToggleSelection: (id: string) => void;
}

function CaptureStage({
  captureTab,
  setCaptureTab,
  scans,
  error,
  cameraError,
  onStartAnalysis,
  dragOver,
  videoRef,
  fileInputRef,
  onCapture,
  onFiles,
  onDragOver,
  onDragLeave,
  onDrop,
  onSwitchToUpload,
  onToggleSelection,
}: CaptureStageProps) {
  const selectedCount = scans.filter(s => s.selected !== false).length;

  return (
    <>
      {/* Header */}
      <div style={{ paddingTop: 32, paddingBottom: 20 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: colors.textPrimary,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Scan a Card
        </h1>
        <p style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
          Include the PSA label in the photo — AI identifies it instantly
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,59,48,0.1)",
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

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 16,
          background: colors.surface,
          borderRadius: 10,
          padding: 4,
        }}
      >
        {(["camera", "upload"] as CaptureTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setCaptureTab(tab)}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              transition: "all 0.15s",
              background: captureTab === tab ? colors.background : "transparent",
              color: captureTab === tab ? colors.textPrimary : colors.textMuted,
              boxShadow: captureTab === tab ? "0 1px 4px rgba(0,0,0,0.4)" : "none",
            }}
          >
            {tab === "camera" ? (
              <Camera size={14} strokeWidth={2} />
            ) : (
              <Upload size={14} strokeWidth={2} />
            )}
            {tab === "camera" ? "Camera" : "Upload"}
          </button>
        ))}
      </div>

      {/* Camera tab */}
      {captureTab === "camera" && (
        <>
          {cameraError ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px 16px",
                background: colors.surface,
                borderRadius: 12,
                border: `1px solid ${colors.border}`,
              }}
            >
              <p style={{ fontSize: 13, color: colors.red, marginBottom: 12 }}>
                {cameraError}
              </p>
              <button
                onClick={onSwitchToUpload}
                style={{
                  fontSize: 13,
                  color: colors.green,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Use Upload instead →
              </button>
            </div>
          ) : (
            <div
              style={{
                position: "relative",
                borderRadius: 12,
                overflow: "hidden",
                background: "#000",
                aspectRatio: "3/4",
              }}
            >
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              {/* Corner guides */}
              {(["tl", "tr", "bl", "br"] as const).map((pos) => (
                <div
                  key={pos}
                  style={{
                    position: "absolute",
                    width: 28,
                    height: 28,
                    borderColor: colors.green,
                    borderStyle: "solid",
                    borderWidth: 0,
                    ...(pos === "tl" && { top: 16, left: 16, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 5 }),
                    ...(pos === "tr" && { top: 16, right: 16, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 5 }),
                    ...(pos === "bl" && { bottom: 16, left: 16, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 5 }),
                    ...(pos === "br" && { bottom: 16, right: 16, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 5 }),
                  }}
                />
              ))}
              {/* Batch Tray for Camera */}
              {scans.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: 16,
                    left: 16,
                    right: 16,
                    display: "flex",
                    gap: 8,
                    overflowX: "auto",
                    paddingBottom: 8,
                  }}
                >
                  {scans.map((s, i) => (
                    <div key={s.id} style={{ position: "relative", cursor: "pointer" }} onClick={() => onToggleSelection(s.id)}>
                      <img
                        src={s.thumbDataUrl}
                        alt="thumb"
                        style={{ width: 40, height: 56, borderRadius: 4, border: `2px solid ${s.selected !== false ? colors.green : colors.border}`, objectFit: "cover", opacity: s.selected !== false ? 1 : 0.5 }}
                      />
                      {s.selected !== false && (
                        <div style={{ position: 'absolute', top: -4, right: -4, background: colors.green, borderRadius: '50%', padding: 2 }}>
                          <CheckCircle size={10} color={colors.background} strokeWidth={3} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Capture button */}
              <div
                style={{
                  position: "absolute",
                  bottom: 20,
                  left: 0,
                  right: 0,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <button
                  onClick={onCapture}
                  aria-label="Capture card photo"
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: colors.green,
                    border: "4px solid rgba(255,255,255,0.9)",
                    cursor: "pointer",
                    boxShadow: `0 0 24px rgba(0,200,5,0.6)`,
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Upload tab */}
      {captureTab === "upload" && (
        <>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            style={{
              position: "relative",
              border: `2px dashed ${dragOver ? colors.green : colors.border}`,
              borderRadius: 12,
              padding: "48px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: dragOver ? colors.greenMuted : "transparent",
              transition: "all 0.15s",
            }}
          >
            <Upload
              size={28}
              style={{ color: colors.textMuted, margin: "0 auto 12px", display: "block" }}
            />
            <p style={{ fontSize: 14, color: colors.textSecondary, margin: 0 }}>
              Drag photos here or{" "}
              <span style={{ color: colors.green }}>browse files</span>
            </p>
            <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 6 }}>
              JPG, PNG, HEIC — any size. Select multiple to batch scan.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              onFiles(e.target.files);
            }}
          />

          {/* Uploaded Files Selection Grid */}
          {scans.length > 0 && (
            <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: 12 }}>
              {scans.map((s) => (
                <div key={s.id} style={{ position: "relative", cursor: "pointer" }} onClick={() => onToggleSelection(s.id)}>
                  <img
                    src={s.thumbDataUrl}
                    alt="thumb"
                    style={{ width: "100%", aspectRatio: "3/4", borderRadius: 8, border: `2px solid ${s.selected !== false ? colors.green : colors.border}`, objectFit: "cover", opacity: s.selected !== false ? 1 : 0.5 }}
                  />
                  {s.selected !== false && (
                    <div style={{ position: 'absolute', top: -6, right: -6, background: colors.green, borderRadius: '50%', padding: 2, border: `2px solid ${colors.surface}` }}>
                      <CheckCircle size={14} color={colors.background} strokeWidth={3} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Global Analyze Button */}
      {selectedCount > 0 && (
        <button
          onClick={onStartAnalysis}
          style={{
            width: "100%",
            marginTop: 24,
            padding: "16px 0",
            borderRadius: 12,
            background: colors.green,
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
          }}
        >
          Scan {selectedCount} {selectedCount === 1 ? "Selected Card" : "Selected Cards"} →
        </button>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Stage 2 — Analyzing
// ─────────────────────────────────────────────────────────

function AnalyzingStage({ scans, activeIndex }: { scans: ScanItem[]; activeIndex: number }) {
  const currentScan = scans[activeIndex];
  if (!currentScan) return null;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        marginTop: 0,
        borderRadius: 16,
        overflow: "hidden",
        aspectRatio: "3/4",
      }}
    >
      {/* Blurred card image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={currentScan.blobUrl}
        alt="Analyzing"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(8px) brightness(0.4)",
          transform: "scale(1.05)",
        }}
      />

      {/* Overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <Loader2
          size={40}
          style={{
            color: colors.green,
            animation: "spin 1s linear infinite",
          }}
        />
        <p
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "#fff",
            textAlign: "center",
            margin: 0,
          }}
        >
          Identifying {activeIndex + 1} of {scans.length}…
        </p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: 0 }}>
          Please leave this screen open
        </p>
      </div>

      {/* CSS for spinner */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Stage 3 — Result
// ─────────────────────────────────────────────────────────

interface ResultStageProps {
  scans: ScanItem[];
  onAddToVault: () => void;
  onScanAgain: () => void;
  estimatedValues: Record<string, number>;
  onSetEstimatedValue: (id: string, value: number) => void;
}

function ResultStage({
  scans,
  onAddToVault,
  onScanAgain,
  estimatedValues,
  onSetEstimatedValue,
}: ResultStageProps) {
  const successes = scans.filter((s) => s.status === "success" && s.result);
  const errors = scans.filter((s) => s.status === "error");

  // A card is "valid to add" if it has a cert number and full slab is visible
  const validToAddCount = successes.filter(
    (s) => s.result?.certNumber && s.result?.isFullSlabVisible
  ).length;

  return (
    <>
      <div style={{ paddingTop: 28, paddingBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: colors.textMuted, margin: 0 }}>
          Batch Analysis Complete
        </p>
      </div>

      {/* Successes List */}
      {successes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          {successes.map((item, idx) => {
            const result = item.result!;
            const gc = gradeColor(result.estimatedGrade);
            const isValid = result.certNumber && result.isFullSlabVisible;

            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  gap: 16,
                  padding: 16,
                  background: isValid ? colors.surface : "rgba(255,59,48,0.04)",
                  borderRadius: 16,
                  border: `1px solid ${isValid ? colors.border : colors.red + "44"}`,
                  alignItems: "flex-start",
                  opacity: isValid ? 1 : 0.8,
                }}
              >
                {/* Thumb - Larger */}
                <div
                  style={{
                    width: 120,
                    height: 168,
                    borderRadius: 8,
                    overflow: "hidden",
                    border: `1px solid ${colors.border}`,
                    flexShrink: 0,
                    background: colors.surfaceOverlay,
                  }}
                >
                  <img
                    src={item.cardImageUrl || item.blobUrl}
                    alt={result.name}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", color: colors.textPrimary, whiteSpace: "normal", wordBreak: "break-word" }}>
                      {result.year ? `${result.year} ` : ""}{result.name}
                    </h3>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      {result.estimatedGrade != null && (
                        <span style={{ fontSize: 13, fontWeight: 700, color: gc, padding: "2px 8px", background: `${gc}18`, borderRadius: 6 }}>
                          PSA {result.estimatedGrade}
                        </span>
                      )}
                      <span style={{ fontSize: 13, color: colors.textSecondary, fontWeight: 500 }}>
                        {result.set}
                      </span>
                    </div>
                  </div>

                  {result.certNumber && (
                    <div style={{ fontSize: 12, color: colors.textMuted, fontFamily: "monospace", letterSpacing: "0.5px" }}>
                      CERT #{result.certNumber}
                    </div>
                  )}

                  {isValid && (
                    <div style={{ marginTop: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: colors.textMuted, marginBottom: 4, display: "block" }}>
                        Estimated Value
                      </label>
                      <div style={{ display: "flex", alignItems: "center", background: colors.background, borderRadius: 8, border: `1px solid ${colors.border}`, overflow: "hidden" }}>
                        <span style={{ padding: "8px 0 8px 10px", fontSize: 14, fontWeight: 600, color: colors.textMuted }}>$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={estimatedValues[item.id] || ""}
                          onChange={(e) => onSetEstimatedValue(item.id, parseFloat(e.target.value) || 0)}
                          style={{
                            flex: 1,
                            padding: "8px 10px 8px 4px",
                            fontSize: 14,
                            fontWeight: 600,
                            color: colors.textPrimary,
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            fontFamily: "inherit",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {!isValid && (
                    <div style={{ marginTop: 8, padding: 8, background: "rgba(255,59,48,0.1)", borderRadius: 8 }}>
                      <p style={{ fontSize: 12, color: colors.red, margin: "0", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                        <XCircle size={14} /> Unacceptable Scan
                      </p>
                      <p style={{ fontSize: 12, color: colors.textPrimary, margin: "4px 0 0" }}>
                        {!result.isFullSlabVisible
                          ? "The entire PSA slab must be visible."
                          : "Certification number could not be verified. Please ensure the barcode is clear."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Errors List */}
      {errors.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {errors.map((errItem) => (
            <div
              key={errItem.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "rgba(255,59,48,0.08)",
                borderRadius: 10,
                border: `1px solid ${colors.red}33`,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 48,
                  borderRadius: 4,
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <img
                  src={errItem.blobUrl}
                  alt="Error"
                  style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.8 }}
                />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: colors.red, margin: 0 }}>
                  Analysis Failed
                </p>
                <p style={{ fontSize: 11, color: colors.red, margin: "2px 0 0", opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {errItem.error || "Unknown error"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <button
        onClick={onAddToVault}
        disabled={validToAddCount === 0}
        style={{
          width: "100%",
          padding: "14px 0",
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 700,
          cursor: validToAddCount > 0 ? "pointer" : "not-allowed",
          border: "none",
          background: validToAddCount > 0 ? colors.green : colors.surfaceOverlay,
          color: validToAddCount > 0 ? colors.textInverse : colors.textMuted,
          marginBottom: 12,
        }}
      >
        Add {validToAddCount > 0 ? validToAddCount : ""} valid {validToAddCount === 1 ? "card" : "cards"} to Vault →
      </button>

      <button
        onClick={onScanAgain}
        style={{
          width: "100%",
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
        Discard & Scan Again
      </button>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Stage 4 — Confirmed
// ─────────────────────────────────────────────────────────

function ConfirmedStage({
  totalCount,
  onScanAgain,
}: {
  totalCount: number;
  onScanAgain: () => void;
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
          {totalCount} {totalCount === 1 ? "Card" : "Cards"} Added to Portfolio
        </h2>
        <p
          style={{
            fontSize: 14,
            color: colors.textSecondary,
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          {totalCount === 1 ? "Your card has" : "Your cards have"} been successfully added to your portfolio.
        </p>
        <p style={{ fontSize: 13, color: colors.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          When you&apos;re ready, you can ship {totalCount === 1 ? "it" : "them"} to the vault from your{" "}
          <span style={{ color: colors.green, fontWeight: 600 }}>Portfolio</span> page.
        </p>
      </div>

      <div
        style={{
          background: colors.greenMuted,
          border: `1px solid ${colors.green}44`,
          borderRadius: 12,
          padding: "14px 20px",
          marginTop: 8,
          maxWidth: 340,
        }}
      >
        <p style={{ fontSize: 13, color: colors.green, margin: 0, lineHeight: 1.5 }}>
          Once shipped and received, our team will verify condition and update your vault status.
        </p>
      </div>

      <Link
        href="/portfolio"
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
        View Portfolio →
      </Link>

      <button
        onClick={onScanAgain}
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
        Scan More Cards
      </button>
    </div>
  );
}
