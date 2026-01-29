/**
 * useResizablePanel Hook
 *
 * Provides drag-to-resize functionality for a panel.
 */

/* global window, document */
import type React from "react";
import { useState, useEffect, useRef, useCallback } from "react";

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

  // Use a ref to track the current height during resize to avoid stale closures
  const heightRef = useRef(panelHeight);
  heightRef.current = panelHeight;

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

  // Save to localStorage when height changes (but not during active resize)
  useEffect(() => {
    if (typeof window !== "undefined" && storageKey && !isResizing) {
      window.localStorage.setItem(storageKey, String(panelHeight));
    }
  }, [panelHeight, storageKey, isResizing]);

  // Refs to store handlers for cleanup
  const mouseMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseUpRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (mouseMoveRef.current) {
        document.removeEventListener("mousemove", mouseMoveRef.current);
      }
      if (mouseUpRef.current) {
        document.removeEventListener("mouseup", mouseUpRef.current);
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent): void => {
      if (disabled || typeof document === "undefined") return;

      e.preventDefault();

      const startY = e.clientY;
      const startHeight = heightRef.current;

      setIsResizing(true);
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent): void => {
        if (!isMountedRef.current) return;
        const deltaY = startY - moveEvent.clientY;
        const reservedHeight = 250;
        const maxHeight = window.innerHeight - reservedHeight;
        const newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + deltaY));

        setPanelHeight(newHeight);
      };

      const handleMouseUp = (): void => {
        if (isMountedRef.current) {
          setIsResizing(false);
        }
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (mouseMoveRef.current) {
          document.removeEventListener("mousemove", mouseMoveRef.current);
        }
        if (mouseUpRef.current) {
          document.removeEventListener("mouseup", mouseUpRef.current);
        }
        mouseMoveRef.current = null;
        mouseUpRef.current = null;
      };

      mouseMoveRef.current = handleMouseMove;
      mouseUpRef.current = handleMouseUp;

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [disabled, minHeight]
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
