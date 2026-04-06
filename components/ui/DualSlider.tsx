"use client";
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { colors } from '@/lib/theme';

interface DualSliderProps {
    min: number;
    max: number;
    value: [number, number];
    onChange: (value: [number, number]) => void;
    formatLabel?: (val: number) => string;
}

/**
 * Minimum space between thumbs so they stay grabbable.
 * Uses ~10.5% of the slider span (see “105” buffer request), with a small floor.
 */
function minThumbGap(min: number, max: number): number {
    if (max <= min) return 0;
    const span = max - min;
    return Math.max(span * 0.105, 0.01);
}

function healCollapsedRange(min: number, max: number, a: number, b: number, gap: number): [number, number] {
    let lo = Math.min(a, b);
    let hi = Math.max(a, b);
    if (hi - lo >= gap) return [lo, hi];
    lo = Math.max(min, Math.min(lo, max - gap));
    hi = Math.min(max, lo + gap);
    return [lo, hi];
}

export function DualSlider({ min, max, value, onChange, formatLabel = (v) => v.toString() }: DualSliderProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState<0 | 1 | null>(null);
    const rafOnChange = useRef<number | null>(null);

    /** Latest range during drag (must not rely on props until commit — fixes stale flush on pointerup). */
    const liveValueRef = useRef(value);
    const isDraggingRef = useRef(isDragging);
    const onChangeRef = useRef(onChange);

    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    /** Fix [x,x] or near-equal ranges from parent so thumbs are never stacked. */
    useEffect(() => {
        if (max <= min || isDragging !== null) return;
        const gap = minThumbGap(min, max);
        const [lo, hi] = healCollapsedRange(min, max, value[0], value[1], gap);
        if (Math.abs(lo - value[0]) > 1e-9 || Math.abs(hi - value[1]) > 1e-9) {
            onChangeRef.current([lo, hi]);
        }
    }, [min, max, value[0], value[1], isDragging]);

    useEffect(() => {
        liveValueRef.current = value;
    }, [value]);

    useEffect(() => {
        isDraggingRef.current = isDragging;
    }, [isDragging]);

    useEffect(() => {
        return () => {
            if (rafOnChange.current != null) cancelAnimationFrame(rafOnChange.current);
        };
    }, []);

    const getPercent = useCallback(
        (val: number) => {
            if (max === min) return 0;
            return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
        },
        [min, max]
    );

    const handlePointerMove = useCallback(
        (e: PointerEvent) => {
            const draggingIdx = isDraggingRef.current;
            if (draggingIdx === null || !trackRef.current) return;

            const rect = trackRef.current.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const newValue = min + percent * (max - min);

            const nextValue = [...liveValueRef.current] as [number, number];
            const gap = minThumbGap(min, max);

            if (draggingIdx === 0) {
                nextValue[0] = Math.min(newValue, nextValue[1] - gap);
            } else {
                nextValue[1] = Math.max(newValue, nextValue[0] + gap);
            }

            liveValueRef.current = nextValue;

            if (rafOnChange.current != null) cancelAnimationFrame(rafOnChange.current);
            rafOnChange.current = requestAnimationFrame(() => {
                rafOnChange.current = null;
                onChangeRef.current(nextValue);
            });
        },
        [min, max]
    );

    const handlePointerUp = useCallback(() => {
        const wasDragging = isDraggingRef.current;
        setIsDragging(null);
        if (wasDragging === null) return;
        if (rafOnChange.current != null) {
            cancelAnimationFrame(rafOnChange.current);
            rafOnChange.current = null;
        }
        onChangeRef.current(liveValueRef.current);
    }, []);

    useEffect(() => {
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [handlePointerMove, handlePointerUp]);

    return (
        <div className="relative flex w-full min-w-0 flex-col justify-center px-1 py-1 select-none">
            {/* Single centered line (truncate) so min/max never collide */}
            <div className="mb-1.5 flex w-full min-w-0 justify-center px-0.5">
                <span
                    className="block max-w-full truncate text-center text-[9px] font-bold tabular-nums leading-none"
                    style={{ color: colors.textMuted }}
                >
                    {formatLabel(value[0])}
                    <span aria-hidden="true" className="inline-block px-1 opacity-40">
                        –
                    </span>
                    {formatLabel(value[1])}
                </span>
            </div>
            <div
                ref={trackRef}
                className="w-full h-1.5 rounded-full relative"
                style={{ background: colors.borderSubtle }}
            >
                {/* Active Range Track */}
                <div
                    className="absolute h-full rounded-full"
                    style={{
                        background: colors.green,
                        left: `${getPercent(value[0])}%`,
                        width: `${getPercent(value[1]) - getPercent(value[0])}%`
                    }}
                />

                {/* Thumb 0 */}
                <div
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragging(0);
                    }}
                    className="absolute w-4 h-4 rounded-full -top-[5px] -ml-2 transition-transform shadow-md touch-none"
                    style={{
                        background: colors.textPrimary,
                        left: `${getPercent(value[0])}%`,
                        cursor: 'grab',
                        zIndex: isDragging === 0 ? 10 : 5,
                        transform: isDragging === 0 ? 'scale(1.3)' : 'scale(1)',
                    }}
                />

                {/* Thumb 1 */}
                <div
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragging(1);
                    }}
                    className="absolute w-4 h-4 rounded-full -top-[5px] -ml-2 transition-transform shadow-md touch-none"
                    style={{
                        background: colors.textPrimary,
                        left: `${getPercent(value[1])}%`,
                        cursor: 'grab',
                        zIndex: isDragging === 1 ? 10 : 5,
                        transform: isDragging === 1 ? 'scale(1.3)' : 'scale(1)',
                    }}
                />
            </div>
        </div>
    );
}
