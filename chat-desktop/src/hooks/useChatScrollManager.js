import { useRef, useCallback, useState, useEffect } from "react";
import {
  SCROLL_STATE,
  AT_BOTTOM_THRESHOLD,
  TOP_PAGINATION_THRESHOLD,
  checkIfAtBottom,
  findVisibleAnchor,
  restoreAnchorPosition,
  shouldLoadOlderMessages,
} from "../utils/chatScrollUtils";

/**
 * Enterprise Intent-Aware Scroll Manager Hook for Chat.
 * Central authority governing chat scroll states, intent detection,
 * anchor preservation, and pagination coordination.
 */
export function useChatScrollManager({
  channelId,
  virtuosoRef,
  hasMore,
  isLoadingMessages,
  onLoadEarlier,
}) {
  const scrollerRef = useRef(null);
  const scrollStateRef = useRef(SCROLL_STATE.FOLLOWING_LATEST);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const pendingAnchorRef = useRef(null);
  const isInitialMountRef = useRef(true);
  const isUserInteractingRef = useRef(false);
  const interactionTimeoutRef = useRef(null);
  const prevChannelIdRef = useRef(channelId);

  const isFollowingLatest = useCallback(() => {
    return scrollStateRef.current === SCROLL_STATE.FOLLOWING_LATEST;
  }, []);

  const markUserInteracting = useCallback(() => {
    isUserInteractingRef.current = true;
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }
    interactionTimeoutRef.current = setTimeout(() => {
      isUserInteractingRef.current = false;
    }, 250);
  }, []);

  // Scroll to bottom (pin to latest message)
  const scrollToLatest = useCallback((behavior = "auto") => {
    scrollStateRef.current = SCROLL_STATE.FOLLOWING_LATEST;
    pendingAnchorRef.current = null;
    setShowScrollBtn(false);

    virtuosoRef.current?.scrollToIndex({
      index: "LAST",
      align: "end",
      behavior,
    });

    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [virtuosoRef]);

  // Handle user input intent (wheel, touch, keys)
  const handleUserIntent = useCallback((e) => {
    markUserInteracting();

    if (e.type === "wheel" && e.deltaY < 0) {
      // User wheeled upward -> reading history
      isInitialMountRef.current = false;
      if (scrollStateRef.current === SCROLL_STATE.FOLLOWING_LATEST) {
        scrollStateRef.current = SCROLL_STATE.READING_HISTORY;
        setShowScrollBtn(true);
        if (scrollerRef.current) {
          const anchor = findVisibleAnchor(scrollerRef.current);
          if (anchor) pendingAnchorRef.current = anchor;
        }
      }
    } else if (e.type === "keydown") {
      const upwardKeys = ["ArrowUp", "PageUp", "Home"];
      if (upwardKeys.includes(e.key)) {
        isInitialMountRef.current = false;
        if (scrollStateRef.current === SCROLL_STATE.FOLLOWING_LATEST) {
          scrollStateRef.current = SCROLL_STATE.READING_HISTORY;
          setShowScrollBtn(true);
        }
      }
    }
  }, [markUserInteracting]);

  // Request older messages with anchor capture
  const triggerLoadOlder = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || isLoadingMessages || !hasMore) return;
    if (scrollStateRef.current === SCROLL_STATE.FOLLOWING_LATEST) return;

    // Capture the anchor message before requesting older messages
    const anchor = findVisibleAnchor(scroller);
    if (anchor) {
      pendingAnchorRef.current = anchor;
    }
    scrollStateRef.current = SCROLL_STATE.LOADING_OLDER;
    onLoadEarlier();
  }, [isLoadingMessages, hasMore, onLoadEarlier]);

  // Central scroll handler attached to the scroller DOM node
  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    // Do not update states while actively restoring anchor position
    if (scrollStateRef.current === SCROLL_STATE.RESTORING_POSITION) {
      return;
    }

    const atBottom = checkIfAtBottom(scroller, AT_BOTTOM_THRESHOLD);

    if (atBottom) {
      if (scrollStateRef.current !== SCROLL_STATE.FOLLOWING_LATEST) {
        scrollStateRef.current = SCROLL_STATE.FOLLOWING_LATEST;
        pendingAnchorRef.current = null;
        setShowScrollBtn(false);
      }
    } else {
      isInitialMountRef.current = false;
      if (scrollStateRef.current === SCROLL_STATE.FOLLOWING_LATEST) {
        scrollStateRef.current = SCROLL_STATE.READING_HISTORY;
        setShowScrollBtn(true);
      }

      // Keep visible anchor fresh while user is reading history
      if (scrollStateRef.current === SCROLL_STATE.READING_HISTORY) {
        const anchor = findVisibleAnchor(scroller);
        if (anchor) {
          pendingAnchorRef.current = anchor;
        }
      }

      // Check pagination threshold
      if (
        !isInitialMountRef.current &&
        shouldLoadOlderMessages({
          hasMore,
          isLoading: isLoadingMessages,
          scrollTop: scroller.scrollTop,
          isAtBottom: false,
          scrollState: scrollStateRef.current,
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
          topThreshold: TOP_PAGINATION_THRESHOLD,
        })
      ) {
        triggerLoadOlder();
      }
    }
  }, [hasMore, isLoadingMessages, triggerLoadOlder]);

  // Scroller ref callback to bind events
  const setScroller = useCallback((element) => {
    if (scrollerRef.current && scrollerRef.current !== element) {
      scrollerRef.current.removeEventListener("scroll", handleScroll);
      scrollerRef.current.removeEventListener("wheel", handleUserIntent);
      scrollerRef.current.removeEventListener("touchmove", handleUserIntent);
    }
    scrollerRef.current = element;
    if (element) {
      element.addEventListener("scroll", handleScroll, { passive: true });
      element.addEventListener("wheel", handleUserIntent, { passive: true });
      element.addEventListener("touchmove", handleUserIntent, { passive: true });
    }
  }, [handleScroll, handleUserIntent]);

  // Integration with Virtuoso's atBottomStateChange callback
  const handleAtBottomStateChange = useCallback((atBottom) => {
    if (isInitialMountRef.current) return;
    if (atBottom) {
      scrollStateRef.current = SCROLL_STATE.FOLLOWING_LATEST;
      setShowScrollBtn(false);
      pendingAnchorRef.current = null;
    } else {
      const scroller = scrollerRef.current;
      if (scroller && !checkIfAtBottom(scroller, AT_BOTTOM_THRESHOLD)) {
        scrollStateRef.current = SCROLL_STATE.READING_HISTORY;
        setShowScrollBtn(true);
      }
    }
  }, []);

  // Virtuoso followOutput prop callback
  const followOutput = useCallback((isAtBottom) => {
    // Only auto-scroll when user is actively following latest
    if (scrollStateRef.current === SCROLL_STATE.FOLLOWING_LATEST) {
      return "auto";
    }
    return false;
  }, []);

  // Start reached callback from Virtuoso
  const handleStartReached = useCallback(() => {
    if (isInitialMountRef.current) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;

    if (
      shouldLoadOlderMessages({
        hasMore,
        isLoading: isLoadingMessages,
        scrollTop: scroller.scrollTop,
        isAtBottom: checkIfAtBottom(scroller, AT_BOTTOM_THRESHOLD),
        scrollState: scrollStateRef.current,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        topThreshold: TOP_PAGINATION_THRESHOLD,
      })
    ) {
      triggerLoadOlder();
    }
  }, [hasMore, isLoadingMessages, triggerLoadOlder]);

  // Handle post-render layout updates (called in useLayoutEffect)
  const handleLayoutUpdate = useCallback(({ isPrepended }) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    if (isPrepended) {
      scrollStateRef.current = SCROLL_STATE.RESTORING_POSITION;
      if (pendingAnchorRef.current) {
        restoreAnchorPosition(scroller, pendingAnchorRef.current);
      }
      scrollStateRef.current = SCROLL_STATE.READING_HISTORY;

      // Verify anchor position on next frame for any deferred image/font layout shifts
      requestAnimationFrame(() => {
        if (
          scrollerRef.current &&
          pendingAnchorRef.current &&
          scrollStateRef.current === SCROLL_STATE.READING_HISTORY
        ) {
          restoreAnchorPosition(scrollerRef.current, pendingAnchorRef.current);
        }
      });
    } else if (
      scrollStateRef.current === SCROLL_STATE.FOLLOWING_LATEST &&
      !isInitialMountRef.current
    ) {
      // Pinned to bottom when content expands or new message arrives while following latest
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, []);

  // Reset scroll manager when active channel changes
  const resetForChannel = useCallback(() => {
    isInitialMountRef.current = true;
    scrollStateRef.current = SCROLL_STATE.FOLLOWING_LATEST;
    pendingAnchorRef.current = null;
    setShowScrollBtn(false);

    const t = requestAnimationFrame(() => {
      scrollToLatest("auto");
    });

    const initTimer = setTimeout(() => {
      isInitialMountRef.current = false;
    }, 400);

    return () => {
      cancelAnimationFrame(t);
      clearTimeout(initTimer);
      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current);
      }
    };
  }, [scrollToLatest]);

  useEffect(() => {
    if (prevChannelIdRef.current !== channelId) {
      prevChannelIdRef.current = channelId;
      return resetForChannel();
    }
  }, [channelId, resetForChannel]);

  return {
    scrollerRef,
    setScroller,
    scrollStateRef,
    isFollowingLatest,
    showScrollBtn,
    setShowScrollBtn,
    scrollToLatest,
    handleUserIntent,
    handleAtBottomStateChange,
    followOutput,
    handleStartReached,
    triggerLoadOlder,
    handleLayoutUpdate,
    resetForChannel,
  };
}
