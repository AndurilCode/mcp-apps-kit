/**
 * useResizablePanelWidth Hook
 *
 * Provides drag-to-resize functionality for a panel (horizontal/width).
 */

/* global window, document */
import type React from "react";
import { useState, useEffect, useRef } from "react";

export interface UseResizablePanelWidthOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth?: number;
  storageKey?: string;
  disabled?: boolean;
}

export interface UseResizablePanelWidthResult {
  panelWidth: number;
  isResizing: boolean;
  resizeHandleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    style: React.CSSProperties;
  };
}

export function useResizablePanelWidth({
  initialWidth,
  minWidth,
  maxWidth = 600,
  storageKey,
  disabled = false,
}: UseResizablePanelWidthOptions): UseResizablePanelWidthResult {
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window !== "undefined" && storageKey) {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= minWidth) {
          return parsed;
        }
      }
    }
    return initialWidth;
  });

  const [isResizing, setIsResizing] = useState(false);

  // Use a ref to track the current width during resize to avoid stale closures
  const widthRef = useRef(panelWidth);
  widthRef.current = panelWidth;

  // Validate width on mount and window resize
  useEffect(() => {
    if (typeof window === "undefined") return;

    const validateWidth = (): void => {
      const reservedWidth = 400; // Reserve space for main content
      const effectiveMaxWidth = Math.min(maxWidth, window.innerWidth - reservedWidth);
      setPanelWidth((current: number) => Math.min(effectiveMaxWidth, Math.max(minWidth, current)));
    };

    validateWidth();
    window.addEventListener("resize", validateWidth);
    return () => {
      window.removeEventListener("resize", validateWidth);
    };
  }, [minWidth, maxWidth]);

  // Save to localStorage when width changes (but not during active resize)
  useEffect(() => {
    if (typeof window !== "undefined" && storageKey && !isResizing) {
      window.localStorage.setItem(storageKey, String(panelWidth));
    }
  }, [panelWidth, storageKey, isResizing]);

  const handleMouseDown = (e: React.MouseEvent): void => {
    if (disabled || typeof document === "undefined") return;

    e.preventDefault();

    const startX = e.clientX;
    const startWidth = widthRef.current;

    setIsResizing(true);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      const deltaX = moveEvent.clientX - startX;
      const reservedWidth = 400;
      const effectiveMaxWidth = Math.min(maxWidth, window.innerWidth - reservedWidth);
      const newWidth = Math.min(effectiveMaxWidth, Math.max(minWidth, startWidth + deltaX));

      setPanelWidth(newWidth);
    };

    const handleMouseUp = (): void => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return {
    panelWidth,
    isResizing,
    resizeHandleProps: {
      onMouseDown: handleMouseDown,
      style: { cursor: disabled ? "default" : "ew-resize" },
    },
  };
}
