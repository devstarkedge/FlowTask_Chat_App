import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { useConnectionRecovery } from '../../hooks/useConnectionRecovery';
import './OfflineBanner.css';

export default function OfflineBanner() {
  const { user } = useAuthStore();
  const isWorkspaceOffline = useWorkspaceStore((s) => s.isOffline);
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const { isOnline, isRecovering, triggerRecovery } = useConnectionRecovery();

  const [wasOffline, setWasOffline] = useState(false);
  const [showRestored, setShowRestored] = useState(false);

  const isActuallyOffline = !isOnline || isWorkspaceOffline || (connectionStatus === 'disconnected' && !isOnline);

  useEffect(() => {
    if (isActuallyOffline) {
      setWasOffline(true);
      setShowRestored(false);
    } else if (wasOffline && isOnline && !isWorkspaceOffline) {
      setShowRestored(true);
      const timer = setTimeout(() => {
        setShowRestored(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isActuallyOffline, wasOffline, isOnline, isWorkspaceOffline]);

  // Only display banner for authenticated users
  if (!user) return null;

  if (showRestored) {
    return (
      <div className="offline-banner restored" role="status" aria-live="polite">
        <div className="offline-banner-content">
          <CheckCircle2 size={15} />
          <span>Connection restored. All systems synchronized.</span>
        </div>
      </div>
    );
  }

  if (!isActuallyOffline && !isWorkspaceOffline) return null;

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <div className="offline-banner-content">
        <WifiOff size={15} />
        <span>
          {!isOnline
            ? "You are currently offline. Viewing cached data."
            : "Backend server is unavailable. You remain logged in with local cache."}
        </span>
      </div>
      <button
        className="offline-banner-retry"
        onClick={() => triggerRecovery()}
        disabled={isRecovering}
      >
        <RefreshCw size={13} className={isRecovering ? "animate-spin" : ""} />
        <span>{isRecovering ? "Connecting…" : "Retry"}</span>
      </button>
    </div>
  );
}
