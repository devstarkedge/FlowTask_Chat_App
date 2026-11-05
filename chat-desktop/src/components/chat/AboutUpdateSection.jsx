import { useEffect, useState } from 'react';
import taskChatLogo from '../../assets/logo.png';
import {
  Sparkles,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  Check,
  Info,
  ExternalLink,
} from 'lucide-react';
import { useUpdateStore } from '../../stores/updateStore';
import { isDesktopApp } from '../../services/desktopService';

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export default function AboutUpdateSection({ onRemindLater, onNavigateAway }) {
  const isDesktop = isDesktopApp();
  const {
    status,
    info,
    progress,
    error,
    currentVersion,
    remindedLater,
    initUpdater,
    checkForUpdate,
    downloadUpdate,
    restartApp,
    remindLater,
  } = useUpdateStore();

  const [lastChecked, setLastChecked] = useState(null);

  useEffect(() => {
    initUpdater();
  }, [initUpdater]);

  const handleCheck = async () => {
    setLastChecked(new Date());
    await checkForUpdate();
  };

  const handleDownload = async () => {
    await downloadUpdate();
  };

  const handleRestart = () => {
    restartApp();
  };

  const handleRemindLater = () => {
    remindLater();
    if (onRemindLater) onRemindLater();
  };

  return (
    <div className="about-update-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* App Header Card */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '16px',
          borderRadius: '12px',
          background: 'var(--bg-secondary, rgba(255, 255, 255, 0.04))',
          border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.08))',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            boxShadow: '0 4px 12px rgba(29, 78, 216, 0.3)',
            flexShrink: 0,
          }}
        >
          <img
            src={taskChatLogo}
            alt="TaskChat Logo"
            onError={(e) => {
              if (!e.currentTarget.dataset.retried) {
                e.currentTarget.dataset.retried = 'true';
                e.currentTarget.src = `${import.meta.env.BASE_URL || './'}logo.png`;
                return;
              }
              e.currentTarget.style.display = 'none';
            }}
            style={{ width: '38px', height: '38px', objectFit: 'contain' }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
              TaskChat
            </h3>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.15)',
                // color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.25)',
              }}
            >
              Desktop
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            Real-time team communication and huddle collaboration
          </p>
        </div>
      </div>

      {/* Version Status Card */}
      <div
        style={{
          padding: '16px',
          borderRadius: '12px',
          background: 'var(--bg-secondary, rgba(255, 255, 255, 0.04))',
          border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.08))',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              Installed Version
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
              v{currentVersion || '1.0.0'}
            </div>
          </div>

          {isDesktop && (
            <button
              type="button"
              onClick={handleCheck}
              disabled={status === 'checking' || status === 'downloading'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: status === 'checking' || status === 'downloading' ? 'not-allowed' : 'pointer',
                background: 'var(--bg-tertiary, rgba(255, 255, 255, 0.08))',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.12))',
                transition: 'all 0.15s ease',
              }}
            >
              <RefreshCw size={14} className={status === 'checking' ? 'animate-spin' : ''} />
              {status === 'checking' ? 'Checking for updates…' : 'Check for Updates'}
            </button>
          )}
        </div>

        {/* Non-desktop note */}
        {!isDesktop && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.08)', color: '#93c5fd', fontSize: '12.5px' }}>
            <Info size={16} style={{ flexShrink: 0 }} />
            <span>You are accessing TaskChat via a web browser. Desktop auto-updates apply to the installed desktop application.</span>
          </div>
        )}

        {/* Status indicator banner */}
        {isDesktop && (
          <div>
            {status === 'not-available' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  color: '#10b981',
                  fontSize: '13px',
                }}
              >
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                <span>TaskChat is up to date (version {currentVersion}).</span>
              </div>
            )}

            {status === 'error' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#ef4444',
                  fontSize: '13px',
                }}
              >
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <strong>Update check failed:</strong>
                  <div style={{ fontSize: '12px', marginTop: '2px', opacity: 0.9 }}>{error || 'Unable to contact update server'}</div>
                </div>
              </div>
            )}

            {/* Available Update Card */}
            {status === 'available' && info && (
              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} style={{ color: '#3b82f6' }} />
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#60a5fa' }}>
                      New Version Available: v{info.version}
                    </span>
                  </div>
                  {info.releaseDate && (
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      {new Date(info.releaseDate).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {info.releaseNotes && (
                  <div
                    style={{
                      maxHeight: '140px',
                      overflowY: 'auto',
                      padding: '10px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.25)',
                      fontSize: '12px',
                      lineHeight: '1.5',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {typeof info.releaseNotes === 'string'
                      ? info.releaseNotes
                      : Array.isArray(info.releaseNotes)
                        ? info.releaseNotes.map(n => n.note).join('\n')
                        : 'Bug fixes and performance improvements.'}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={handleDownload}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <Download size={15} />
                    Download Update
                  </button>
                  <button
                    type="button"
                    onClick={handleRemindLater}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.12))',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Remind Me Later
                  </button>
                </div>
              </div>
            )}

            {/* Downloading State */}
            {status === 'downloading' && (
              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Downloading update {info?.version ? `v${info.version}` : ''}…
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#3b82f6' }}>
                    {progress?.percent || 0}%
                  </span>
                </div>

                {/* Progress bar track */}
                <div
                  style={{
                    height: '8px',
                    width: '100%',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${progress?.percent || 0}%`,
                      background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                      borderRadius: '4px',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>

                {progress && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    <span>
                      {formatBytes(progress.transferred)} of {formatBytes(progress.total)}
                    </span>
                    <span>
                      {formatBytes(progress.bytesPerSecond)}/s
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Downloaded State */}
            {status === 'downloaded' && (
              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Update v{info?.version} Ready to Install
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Restart now to complete the update, or choose Remind Me Later to finish automatically on your next launch.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={handleRestart}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      background: '#10b981',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <RotateCcw size={15} />
                    Restart Now
                  </button>
                  <button
                    type="button"
                    onClick={handleRemindLater}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.12))',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Remind Me Later
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* System Information card */}
      <div
        style={{
          padding: '14px 16px',
          borderRadius: '12px',
          background: 'var(--bg-secondary, rgba(255, 255, 255, 0.04))',
          border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.08))',
          fontSize: '12.5px',
          color: 'var(--text-muted)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Channel</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Production (GitHub Releases)</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Publisher</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>FlowTask Desktop</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Repository</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>devstarkedge/FlowTask_Chat_App</span>
        </div>
      </div>
    </div>
  );
}
