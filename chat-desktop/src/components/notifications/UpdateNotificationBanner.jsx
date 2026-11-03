import { useEffect } from 'react';
import { Sparkles, Download, RotateCcw, X, Info } from 'lucide-react';
import { useUpdateStore } from '../../stores/updateStore';
import { isDesktopApp } from '../../services/desktopService';

export default function UpdateNotificationBanner({ onOpenAbout }) {
  const isDesktop = isDesktopApp();
  const {
    status,
    info,
    progress,
    remindedLater,
    initUpdater,
    downloadUpdate,
    restartApp,
    remindLater,
  } = useUpdateStore();

  useEffect(() => {
    initUpdater();
  }, [initUpdater]);

  // If not running on desktop or no update available/downloaded/downloading, render nothing.
  // Fulfills requirement: "Do not display update notifications when no newer published release exists."
  if (!isDesktop) return null;
  if (status !== 'available' && status !== 'downloading' && status !== 'downloaded') return null;
  if (remindedLater && status !== 'downloaded') return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        maxWidth: '380px',
        width: 'calc(100% - 48px)',
        borderRadius: '12px',
        background: 'var(--bg-primary, #1e1e2d)',
        border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.15))',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: status === 'downloaded' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
              color: status === 'downloaded' ? '#10b981' : '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {status === 'downloaded' ? <RotateCcw size={18} /> : <Sparkles size={18} />}
          </div>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary, #ffffff)' }}>
              {status === 'downloaded'
                ? `TaskChat v${info?.version || ''} Ready`
                : status === 'downloading'
                  ? `Downloading TaskChat v${info?.version || ''}`
                  : `TaskChat v${info?.version || ''} Available`}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>
              {status === 'downloaded'
                ? 'Restart now to complete the update.'
                : status === 'downloading'
                  ? `${progress?.percent || 0}% downloaded`
                  : 'A new desktop release is ready for installation.'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={remindLater}
          title="Remind Me Later"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted, #94a3b8)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress Bar if downloading */}
      {status === 'downloading' && (
        <div
          style={{
            height: '6px',
            width: '100%',
            borderRadius: '3px',
            background: 'rgba(255, 255, 255, 0.1)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress?.percent || 0}%`,
              background: '#3b82f6',
              borderRadius: '3px',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {status === 'available' && (
          <button
            type="button"
            onClick={downloadUpdate}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '7px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Download size={14} />
            Download
          </button>
        )}

        {status === 'downloaded' && (
          <button
            type="button"
            onClick={restartApp}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '7px',
              background: '#10b981',
              color: '#ffffff',
              border: 'none',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={14} />
            Restart Now
          </button>
        )}

        {onOpenAbout && (
          <button
            type="button"
            onClick={onOpenAbout}
            style={{
              padding: '7px 12px',
              borderRadius: '7px',
              background: 'transparent',
              color: 'var(--text-primary, #ffffff)',
              border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.15))',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Details
          </button>
        )}

        <button
          type="button"
          onClick={remindLater}
          style={{
            padding: '7px 12px',
            borderRadius: '7px',
            background: 'transparent',
            color: 'var(--text-muted, #94a3b8)',
            border: 'none',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Remind Later
        </button>
      </div>
    </div>
  );
}
