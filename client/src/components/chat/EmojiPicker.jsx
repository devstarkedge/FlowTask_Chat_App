import { useState, useRef, useEffect } from 'react'

const EMOJI_CATEGORIES = {
  'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  'Gestures': ['👍','👎','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','🫵','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤝','🙏','💪','🫶','❤️','🔥','⭐','💯','✅','❌','⚡','💡','🎉','🎊','👏','🙌','🫡'],
  'Objects': ['💼','📁','📂','📋','📌','📎','📝','✏️','📅','📆','🗓️','⏰','⏳','📊','📈','📉','🔔','🔕','💬','💭','🗨️','📢','📣','🏷️','🔖','🔗','📧','✉️','📩','📨','📤','📥','📦'],
  'Symbols': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','⭐','🌟','💫','✨','⚡','🔥','💥','❗','❓','💤','💢','💦','🎵','🎶'],
}

const QUICK_REACTIONS = ['👍','❤️','😂','😮','😢','🔥','👏','🎉','💯','🤔']

export default function EmojiPicker({ onSelect, onClose, position = 'top' }) {
  const [activeCategory, setActiveCategory] = useState('Smileys')
  const [search, setSearch] = useState('')
  const pickerRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose?.()
      }
    }
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const allEmojis = Object.values(EMOJI_CATEGORIES).flat()
  const filtered = search
    ? allEmojis.filter(() => true).slice(0, 40)
    : EMOJI_CATEGORIES[activeCategory] || []

  return (
    <div
      ref={pickerRef}
      className="animate-fade-in-scale"
      style={{
        position: 'absolute',
        [position === 'top' ? 'bottom' : 'top']: '100%',
        right: 0,
        zIndex: 60,
        width: 320,
        background: 'var(--bg-modal)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)',
        marginBottom: position === 'top' ? 8 : 0,
        marginTop: position === 'bottom' ? 8 : 0,
      }}
    >
      {/* Search */}
      <div style={{ padding: '10px 10px 6px' }}>
        <input
          type="text"
          placeholder="Search emoji..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field"
          style={{ fontSize: 13, padding: '6px 10px' }}
          autoFocus
        />
      </div>

      {/* Quick Reactions */}
      <div style={{ padding: '4px 10px 8px', display: 'flex', gap: 2 }}>
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => { onSelect(emoji); onClose?.() }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 32,
              border: 'none',
              background: 'transparent',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 18,
              transition: 'background var(--transition-fast)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--border-secondary)' }} />

      {/* Category Tabs */}
      {!search && (
        <div style={{ display: 'flex', padding: '6px 10px 4px', gap: 2, overflowX: 'auto' }}>
          {Object.keys(EMOJI_CATEGORIES).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 600,
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                background: activeCategory === cat ? 'var(--accent-primary)' : 'transparent',
                color: activeCategory === cat ? 'white' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
                transition: 'all var(--transition-fast)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Emoji Grid */}
      <div style={{ padding: '6px 10px 10px', maxHeight: 200, overflowY: 'auto' }}>
        <div className="emoji-grid">
          {filtered.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              onClick={() => { onSelect(emoji); onClose?.() }}
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
        {filtered.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 16 }}>
            No emoji found
          </p>
        )}
      </div>
    </div>
  )
}

export { QUICK_REACTIONS }
