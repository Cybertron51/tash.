"use client";

import { useState, useEffect } from "react";

/**
 * useIsMobile — Hook to detect if the user is on a mobile device.
 * Breakpoint is set to 768px (MD in Tailwind).
 */
export function useIsMobile() {
    const [isMobile, setIsMobile] = useState<boolean>(false);

    useEffect(() => {
        // Check on mount
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };

        checkMobile();

        // Listen for resize
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    return isMobile;
}
