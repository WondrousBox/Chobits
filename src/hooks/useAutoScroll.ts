import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Smart auto-scroll hook for chat-like UIs.
 *
 * Behavior:
 * - Auto-scrolls to bottom when new content arrives, as long as the user
 *   hasn't scrolled up to browse history.
 * - If the user scrolls up (breaking from the bottom), auto-scroll is paused.
 * - Auto-scroll resumes when the user scrolls back near the bottom.
 * - Exposes `showScrollButton` when the user is far enough from the bottom.
 *
 * Uses instant `scrollTop` assignment during streaming to avoid the flicker
 * caused by overlapping `scrollIntoView({ behavior: 'smooth' })` calls.
 */
export function useAutoScroll(deps: unknown[]): {
  containerRef: React.RefObject<HTMLDivElement>;
  shouldAutoScroll: boolean;
  showScrollButton: boolean;
  scrollToBottom: (smooth?: boolean) => void;
  resetAutoScroll: () => void;
} {
  const containerRef = useRef<HTMLDivElement>(null!);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  // Track whether the user is actively interacting (wheel / touch / pointer-drag on scrollbar)
  const userScrollingRef = useRef(false);
  // Use a ref mirror so the scroll-event handler always sees the latest value
  // without re-registering the listener.
  const shouldAutoScrollRef = useRef(true);

  const BOTTOM_THRESHOLD = 60; // px from bottom to consider "at bottom"
  const BUTTON_THRESHOLD = 300; // px from bottom to show scroll-to-bottom button

  // Sync ref with state
  useEffect(() => {
    shouldAutoScrollRef.current = shouldAutoScroll;
  }, [shouldAutoScroll]);

  // ---------- scroll event handler ----------
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom <= BOTTOM_THRESHOLD;

    // Show / hide the "scroll to bottom" button
    setShowScrollButton(distanceFromBottom > BUTTON_THRESHOLD);

    if (userScrollingRef.current) {
      // User-initiated scroll
      if (nearBottom) {
        // User scrolled back to the bottom → resume auto-scroll
        setShouldAutoScroll(true);
      } else {
        // User scrolled away → pause auto-scroll
        setShouldAutoScroll(false);
      }
    }
  }, []);

  // ---------- detect user-initiated scrolls ----------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Mark user-initiated scrolling on wheel / touch events
    const onWheel = (): void => {
      userScrollingRef.current = true;
      // Reset after a short debounce so the next programmatic scroll isn't
      // mistaken for a user action.
      clearUserScrollTimer();
    };
    const onTouchStart = (): void => {
      userScrollingRef.current = true;
      clearUserScrollTimer();
    };
    const onPointerDown = (e: PointerEvent): void => {
      // Detect scrollbar drag: pointerdown on the container but outside its
      // content (offsetX > clientWidth).
      if (e.target === el && e.offsetX > el.clientWidth) {
        userScrollingRef.current = true;
        clearUserScrollTimer();
      }
    };

    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    const clearUserScrollTimer = (): void => {
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        userScrollingRef.current = false;
      }, 150);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('pointerdown', onPointerDown);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('pointerdown', onPointerDown);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [handleScroll]);

  // ---------- auto-scroll on content change ----------
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const el = containerRef.current;
    if (!el) return;

    // Use rAF so the DOM has settled before we measure / scroll.
    requestAnimationFrame(() => {
      // Instant scroll to avoid flicker from overlapping smooth scrolls.
      el.scrollTop = el.scrollHeight;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // ---------- imperative helpers ----------
  const scrollToBottom = useCallback((smooth = true) => {
    const el = containerRef.current;
    if (!el) return;
    setShouldAutoScroll(true);
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  /** Call this when the user sends a new message to force auto-scroll on. */
  const resetAutoScroll = useCallback(() => {
    setShouldAutoScroll(true);
    const el = containerRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, []);

  return {
    /** Attach this ref to the scrollable container element. */
    containerRef,
    /** Whether auto-scroll is currently active. */
    shouldAutoScroll,
    /** Whether the scroll-to-bottom button should be visible. */
    showScrollButton,
    /** Scroll to the bottom (optionally smooth). */
    scrollToBottom,
    /** Force-enable auto-scroll and jump to bottom (e.g. after user sends a message). */
    resetAutoScroll
  };
}
