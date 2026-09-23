/**
 * useDeleteConfirm
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable hook for all destructive actions in the application.
 * Shows a styled confirmation toast BEFORE executing any delete/remove.
 *
 * Usage:
 *   const { confirm } = useDeleteConfirm()
 *
 *   const handleDelete = async () => {
 *     const ok = await confirm({ message: 'Delete this message?' })
 *     if (!ok) return
 *     // perform the actual deletion
 *   }
 *
 * Options:
 *   message      – string    – body text shown in the tinted content block (required)
 *   title        – string    – bold title above the message
 *   subtitle     – string    – muted sub-line next to the title (default: varies by variant)
 *   confirmLabel – string    – button label (default: "Delete")
 *   cancelLabel  – string    – button label (default: "Cancel")
 *   variant      – 'danger' | 'warning' | 'info'
 *                             controls icon-badge color + confirm-button color (default: 'danger')
 *   danger       – boolean   – legacy alias: true → 'danger', false → 'info' (default: true)
 *   icon         – ReactNode – optional icon shown inside the icon badge
 */

import toast from 'react-hot-toast'
import { Trash2, Archive, UserMinus, X } from 'lucide-react'

/* ─── Shared styles injected once ─────────────────────────────────────────── */
const STYLE_ID = 'delete-confirm-toast-styles-v2'
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    /* ── Delete Confirm Toast v2 ── */
    .dct-shell {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 300px;
      padding: 16px;
      border-radius: 14px;
      background: var(--bg-primary, #ffffff);
      border: 0.5px solid var(--border-secondary, #e0e0e0);
      box-shadow:
        0 4px 6px -1px rgba(0,0,0,0.08),
        0 10px 32px -4px rgba(0,0,0,0.12);
      font-family: var(--font-sans, system-ui, sans-serif);
      animation: dct-pop 220ms cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
    }

    @keyframes dct-pop {
      from { opacity: 0; transform: scale(0.92) translateY(8px); }
      to   { opacity: 1; transform: scale(1)    translateY(0);   }
    }

    .dct-shell.dct-shake {
      animation: dct-pop 220ms cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
    }

    /* ── Header ── */
    .dct-header {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .dct-icon-wrap {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .dct-icon-wrap--danger  { background: rgba(220, 53, 69,  0.12); color: #dc3545; }
    .dct-icon-wrap--warning { background: rgba(255, 152, 0,  0.13); color: #e65100; }
    .dct-icon-wrap--info    { background: rgba(13,  110, 253, 0.11); color: #0d6efd; }

    .dct-title-block {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .dct-title {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--text-primary, #111111);
      line-height: 1.3;
    }
    .dct-subtitle {
      font-size: 11.5px;
      color: var(--text-tertiary, #999999);
      line-height: 1.4;
    }

    /* ── Body / message block ── */
    .dct-body {
      font-size: 12.5px;
      color: var(--text-secondary, #555555);
      line-height: 1.6;
      padding: 10px 12px;
      background: var(--bg-secondary, #f5f5f5);
      border-radius: 8px;
      border: 0.5px solid var(--border-primary, #e8e8e8);
    }

    /* ── Actions ── */
    .dct-actions {
      display: flex;
      gap: 8px;
    }
    .dct-btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
      transition: filter 120ms ease, transform 80ms ease;
      border: none;
      outline: none;
      white-space: nowrap;
    }
    .dct-btn:active { transform: scale(0.97); }

    .dct-btn--cancel {
      background: var(--bg-secondary, #f0f0f0);
      color: var(--text-secondary, #555555);
    }
    .dct-btn--cancel:hover { filter: brightness(0.95); }

    .dct-btn--danger {
      background: rgba(220, 53, 69, 0.12);
      color: #c0392b;
    }
    .dct-btn--danger:hover  { filter: brightness(0.91); }

    .dct-btn--warning {
      background: rgba(255, 152, 0, 0.13);
      color: #e65100;
    }
    .dct-btn--warning:hover { filter: brightness(0.91); }

    .dct-btn--info {
      background: rgba(13, 110, 253, 0.11);
      color: #0d6efd;
    }
    .dct-btn--info:hover    { filter: brightness(0.91); }

    /* ── Dark theme ── */
    [data-theme="dark"] .dct-shell {
      background: #1c1e22;
      border-color: #2e3036;
      box-shadow:
        0 4px 6px -1px rgba(0,0,0,0.3),
        0 10px 32px -4px rgba(0,0,0,0.4);
    }
    [data-theme="dark"] .dct-title   { color: #f0f0f0; }
    [data-theme="dark"] .dct-subtitle { color: #6b6f78; }
    [data-theme="dark"] .dct-body {
      background: #14161a;
      border-color: #282c32;
      color: #9ba0aa;
    }
    [data-theme="dark"] .dct-btn--cancel {
      background: #282c32;
      color: #9ba0aa;
    }
    [data-theme="dark"] .dct-icon-wrap--danger  { background: rgba(220, 53, 69,  0.18); }
    [data-theme="dark"] .dct-icon-wrap--warning { background: rgba(255, 152, 0,  0.18); }
    [data-theme="dark"] .dct-icon-wrap--info    { background: rgba(13,  110, 253, 0.18); }
    [data-theme="dark"] .dct-btn--danger  { background: rgba(220, 53, 69,  0.18); color: #e05c6a; }
    [data-theme="dark"] .dct-btn--warning { background: rgba(255, 152, 0,  0.18); color: #ff9a3c; }
    [data-theme="dark"] .dct-btn--info    { background: rgba(13,  110, 253, 0.18); color: #4d8fef; }
  `
  document.head.appendChild(s)
}

/* ─── Default icons per variant ──────────────────────────────────────────── */
const DEFAULT_ICONS = {
  danger:  Trash2,
  warning: Archive,
  info:    UserMinus,
}

const DEFAULT_SUBTITLES = {
  danger:  'This action cannot be undone',
  warning: 'You can restore it later',
  info:    'They will lose access immediately',
}

/* ─── The confirmation toast component ───────────────────────────────────── */
function ConfirmToast({
  t,
  title,
  subtitle,
  message,
  confirmLabel = 'Delete',
  cancelLabel  = 'Cancel',
  variant      = 'danger',
  icon: CustomIcon,
  onConfirm,
  onCancel,
}) {
  const IconComp = CustomIcon || DEFAULT_ICONS[variant] || Trash2
  const sub      = subtitle  ?? DEFAULT_SUBTITLES[variant] ?? 'Are you sure?'

  return (
    <div className="dct-shell">
      {/* Header */}
      <div className="dct-header">
        <div className={`dct-icon-wrap dct-icon-wrap--${variant}`}>
          <IconComp size={15} strokeWidth={2} />
        </div>
        <div className="dct-title-block">
          <span className="dct-title">{title || 'Are you sure?'}</span>
          {sub && <span className="dct-subtitle">{sub}</span>}
        </div>
      </div>

      {/* Body */}
      {message && <p className="dct-body">{message}</p>}

      {/* Actions */}
      <div className="dct-actions">
        <button
          className="dct-btn dct-btn--cancel"
          onClick={() => {
            toast.remove(t.id)
            onCancel()
          }}
        >
          <X size={12} strokeWidth={2.5} />
          {cancelLabel}
        </button>
        <button
          className={`dct-btn dct-btn--${variant}`}
          onClick={() => {
            toast.remove(t.id)
            onConfirm()
          }}
          autoFocus
        >
          <IconComp size={12} strokeWidth={2.2} />
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}

/* ─── The hook ────────────────────────────────────────────────────────────── */
export function useDeleteConfirm() {
  /**
   * confirm(options) -> Promise<boolean>
   * Resolves true if user clicks Confirm, false if they click Cancel or dismiss.
   */
  const confirm = ({
    message,
    title,
    subtitle,
    confirmLabel = 'Delete',
    cancelLabel  = 'Cancel',
    variant,
    danger       = true,
    icon,
  } = {}) => {
    // Resolve variant: explicit `variant` prop wins; fall back to legacy `danger` boolean
    const resolvedVariant = variant ?? (danger ? 'danger' : 'info')

    return new Promise((resolve) => {
      toast.custom(
        (t) => (
          <ConfirmToast
            t={t}
            title={title}
            subtitle={subtitle}
            message={message}
            confirmLabel={confirmLabel}
            cancelLabel={cancelLabel}
            variant={resolvedVariant}
            icon={icon}
            onConfirm={() => resolve(true)}
            onCancel={() => resolve(false)}
          />
        ),
        {
          id: 'global-delete-confirm', // Prevents multiple instances
          duration: Infinity,       // stays until the user acts
          position: 'top-center',
          removeDelay: 0,           // skip exit animation — removes instantly
        },
      )
    })
  }

  return { confirm }
}

export default useDeleteConfirm

