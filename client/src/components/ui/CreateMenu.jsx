import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  MessageSquare, Hash, Headphones, FileText, List, Zap, UserPlus,
} from 'lucide-react'

const ITEMS = [
  { icon: MessageSquare, label: 'Message', desc: 'Start a conversation in a DM or channel', shortcut: 'Ctrl+N' },
  { icon: Hash, label: 'Channel', desc: 'Start a group conversation by topic' },
  { icon: Headphones, label: 'Huddle', desc: 'Start a video or audio chat' },
  { icon: FileText, label: 'Canvas', desc: 'Create and share content', shortcut: 'Ctrl+Shift+N' },
  { icon: List, label: 'List', desc: 'Track and manage projects' },
  { icon: Zap, label: 'Workflow', desc: 'Automate everyday tasks' },
]

export default function CreateMenu({ anchorRef, onClose }) {
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose, anchorRef])

  const rect = anchorRef.current?.getBoundingClientRect()
  if (!rect) return null

  const style = {
    bottom: window.innerHeight - rect.top + 8,
    left: rect.right + 8,
  }

  return createPortal(
    <div ref={menuRef} className="create-menu" style={style}>
      <p className="text-xs font-bold uppercase tracking-wider px-3 py-2" style={{ color: 'var(--text-muted)' }}>
        Create
      </p>
      {ITEMS.map((item) => (
        <button key={item.label} className="create-menu-item" onClick={onClose}>
          <div className="create-menu-item-icon">
            <item.icon size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: 'var(--text-white)' }}>{item.label}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{item.desc}</p>
          </div>
          {item.shortcut && (
            <span className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)' }}>{item.shortcut}</span>
          )}
        </button>
      ))}
      <div style={{ height: 1, background: 'var(--border-secondary)', margin: '4px 0' }} />
      <button className="create-menu-item" onClick={onClose}>
        <div className="create-menu-item-icon">
          <UserPlus size={16} />
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-white)' }}>Invite people</p>
        </div>
      </button>
    </div>,
    document.body,
  )
}
