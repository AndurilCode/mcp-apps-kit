/**
 * useResizablePanel Hook
 *
 * Provides drag-to-resize functionality for a panel.
 */

/* global window, document */
import type React from "react";
import { useState, useEffect, useCallback, useRef } from "react";

export interface UseResizablePanelOptions {
  initialHeight: number;
  minHeight: number;
  storageKey?: string;
  disabled?: boolean;
}

export interface UseResizablePanelResult {
  panelHeight: number;
  isResizing: boolean;
  resizeHandleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    style: React.CSSProperties;
  };
}

export function useResizablePanel({
  initialHeight,
  minHeight,
  storageKey,
  disabled = false,
}: UseResizablePanelOptions): UseResizablePanelResult {
  const [panelHeight, setPanelHeight] = useState(() => {
    if (typeof window !== "undefined" && storageKey) {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= minHeight) {
          return parsed;
        }
      }
    }
    return initialHeight;
  });

  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Validate height on mount and window resize
  useEffect(() => {
    if (typeof window === "undefined") return;

    const validateHeight = (): void => {
      const reservedHeight = 250;
      const maxHeight = window.innerHeight - reservedHeight;
      setPanelHeight((current: number) => Math.min(maxHeight, Math.max(minHeight, current)));
    };

    validateHeight();
    window.addEventListener("resize", validateHeight);
    return () => {
      window.removeEventListener("resize", validateHeight);
    };
  }, [minHeight]);

  // Save to localStorage when height changes
  useEffect(() => {
    if (typeof window !== "undefined" && storageKey && !isResizing) {
      window.localStorage.setItem(storageKey, String(panelHeight));
    }
  }, [panelHeight, storageKey, isResizing]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (disabled || typeof window === "undefined") return;

      const deltaY = startYRef.current - e.clientY;
      const reservedHeight = 250;
      const maxHeight = window.innerHeight - reservedHeight;
      const newHeight = Math.min(maxHeight, Math.max(minHeight, startHeightRef.current + deltaY));

      setPanelHeight(newHeight);
    },
    [disabled, minHeight]
  );

  const handleMouseUp = useCallback(() => {
    if (typeof document === "undefined") return;

    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || typeof document === "undefined") return;

      setIsResizing(true);
      startYRef.current = e.clientY;
      startHeightRef.current = panelHeight;
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [disabled, panelHeight, handleMouseMove, handleMouseUp]
  );

  return {
    panelHeight,
    isResizing,
    resizeHandleProps: {
      onMouseDown: handleMouseDown,
      style: { cursor: disabled ? "default" : "ns-resize" },
    },
  };
}
