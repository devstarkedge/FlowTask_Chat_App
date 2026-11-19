import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useChannelStore } from '../stores/channelStore';
import { useChatStore } from '../stores/chatStore';
import { connectSocket } from '../services/socket';
import { isTokenExpiringSoon, executeSilentRefresh } from '../services/tokenRefreshScheduler';
import logger from '../utils/logger';

const MIN_COOLDOWN_MS = 3500;
const BASE_BACKOFF_MS = 1500;
const MAX_BACKOFF_MS = 30000;
const MAX_JITTER_MS = 2500;

/**
 * Calculates exponential backoff with full randomized jitter to defeat the "Thundering Herd" problem.
 */
export function getJitteredBackoffMs(attempt) {
  const exponential = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(1.5, attempt));
  const jitter = Math.floor(Math.random() * MAX_JITTER_MS);
  return exponential + jitter;
}

export function useConnectionRecovery() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isRecovering, setIsRecovering] = useState(false);
  const lastSyncRef = useRef(0);
  const attemptCountRef = useRef(0);
  const recoveryTimerRef = useRef(null);
  const retryLoopTimerRef = useRef(null);

  const triggerRecovery = useCallback(async (isScheduledRetry = false) => {
    const now = Date.now();
    if (!isScheduledRetry && now - lastSyncRef.current < MIN_COOLDOWN_MS) {
      return;
    }
    lastSyncRef.current = now;
    setIsRecovering(true);

    try {
      const authState = useAuthStore.getState();
      if (!authState.accessToken && !authState.refreshToken) {
        setIsRecovering(false);
        return;
      }

      logger.info('[ConnectionRecovery] Reconnection initiated — beginning jittered multi-tier synchronization...');

      // 1. If access token is expired or expiring soon, perform proactive silent refresh first
      if (authState.accessToken && isTokenExpiringSoon(authState.accessToken)) {
        await executeSilentRefresh(useAuthStore).catch(() => {});
      }

      // 2. Re-validate user session
      await authState.fetchUser().catch((err) => {
        logger.warn('[ConnectionRecovery] User revalidation failed:', err?.message);
      });

      // 3. Sync fresh workspaces
      await useWorkspaceStore.getState().fetchWorkspaces().catch((err) => {
        logger.warn('[ConnectionRecovery] Workspace sync failed:', err?.message);
      });

      // 4. Sync channels for active workspace
      const activeWsId = useWorkspaceStore.getState().activeWorkspaceId;
      if (activeWsId) {
        await useChannelStore.getState().fetchChannels(activeWsId).catch((err) => {
          logger.warn('[ConnectionRecovery] Channel sync failed:', err?.message);
        });
      }

      // 5. Ensure socket connection is restored
      const sockStatus = useChatStore.getState().connectionStatus;
      if (sockStatus !== 'connected') {
        connectSocket();
      }

      // Recovery succeeded: reset retry attempt count
      attemptCountRef.current = 0;
      if (retryLoopTimerRef.current) {
        clearTimeout(retryLoopTimerRef.current);
        retryLoopTimerRef.current = null;
      }
      logger.info('[ConnectionRecovery] Enterprise synchronization completed successfully.');
    } catch (error) {
      attemptCountRef.current += 1;
      const backoffMs = getJitteredBackoffMs(attemptCountRef.current);
      logger.error(`[ConnectionRecovery] Recovery failed. Scheduling retry #${attemptCountRef.current} in ${Math.round(backoffMs / 1000)}s:`, error);
      
      // Schedule jittered exponential retry
      if (retryLoopTimerRef.current) clearTimeout(retryLoopTimerRef.current);
      retryLoopTimerRef.current = setTimeout(() => {
        triggerRecovery(true);
      }, backoffMs);
    } finally {
      setIsRecovering(false);
    }
  }, []);

  useEffect(() => {
    // 1. Browser online/offline listeners with randomized jitter
    const handleOnline = () => {
      logger.info('[ConnectionRecovery] Network connection restored (online event).');
      setIsOnline(true);
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
      // Stagger recovery with 300ms - 1500ms jitter to prevent thundering herd
      const randomJitter = 300 + Math.floor(Math.random() * 1200);
      recoveryTimerRef.current = setTimeout(() => {
        triggerRecovery();
      }, randomJitter);
    };

    const handleOffline = () => {
      logger.warn('[ConnectionRecovery] Network connection lost (offline event).');
      setIsOnline(false);
      if (retryLoopTimerRef.current) clearTimeout(retryLoopTimerRef.current);
    };

    // 2. Page Visibility & Sleep/Wake Detection (e.g. laptop lid opened or tab brought to foreground)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const authState = useAuthStore.getState();
        const sockStatus = useChatStore.getState().connectionStatus;
        const needsRecovery =
          (authState.accessToken && isTokenExpiringSoon(authState.accessToken)) ||
          sockStatus === 'disconnected' ||
          !isOnline;

        if (needsRecovery) {
          logger.info('[ConnectionRecovery] Device woke up / tab focused — initiating background revalidation.');
          const wakeJitter = Math.floor(Math.random() * 800);
          setTimeout(() => triggerRecovery(), wakeJitter);
        }
      }
    };

    // 3. Window focus event
    const handleWindowFocus = () => {
      if (document.visibilityState === 'visible') {
        handleVisibilityChange();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
      if (retryLoopTimerRef.current) clearTimeout(retryLoopTimerRef.current);
    };
  }, [triggerRecovery, isOnline]);

  return { isOnline, isRecovering, triggerRecovery };
}
