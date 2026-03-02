import { useState, useRef, useEffect, useMemo } from 'react'

// Emoji data with searchable names
const EMOJI_DATA = [
  // Smileys
  { e: '😀', n: 'grinning face happy' }, { e: '😃', n: 'smiley happy' }, { e: '😄', n: 'smile happy' },
  { e: '😁', n: 'grin happy' }, { e: '😆', n: 'laughing happy' }, { e: '😅', n: 'sweat smile awkward' },
  { e: '🤣', n: 'rofl rolling laughing' }, { e: '😂', n: 'joy tears laughing' }, { e: '🙂', n: 'slightly smiling' },
  { e: '😊', n: 'blush happy warm' }, { e: '😇', n: 'innocent angel halo' }, { e: '🥰', n: 'love hearts face' },
  { e: '😍', n: 'heart eyes love' }, { e: '🤩', n: 'star struck excited' }, { e: '😘', n: 'kissing heart love' },
  { e: '😗', n: 'kissing' }, { e: '😚', n: 'kissing closed eyes' }, { e: '😙', n: 'kissing smiling' },
  { e: '🥲', n: 'smiling tear sad happy' }, { e: '😋', n: 'yum delicious food' }, { e: '😛', n: 'tongue out' },
  { e: '😜', n: 'winking tongue playful' }, { e: '🤪', n: 'zany crazy wild' }, { e: '😝', n: 'squinting tongue' },
  { e: '🤑', n: 'money face rich' }, { e: '🤗', n: 'hugging hug warm' }, { e: '🤭', n: 'hand over mouth shy' },
  { e: '🫢', n: 'peeking hand mouth' }, { e: '🤫', n: 'shushing quiet secret' }, { e: '🤔', n: 'thinking hmm' },
  { e: '🤐', n: 'zipper mouth quiet' }, { e: '🤨', n: 'raised eyebrow skeptical' },
  { e: '😐', n: 'neutral face' }, { e: '😑', n: 'expressionless blank' }, { e: '😶', n: 'no mouth silent' },
  { e: '🫥', n: 'dotted line invisible' }, { e: '😏', n: 'smirk sly' }, { e: '😒', n: 'unamused annoyed' },
  { e: '🙄', n: 'eye roll annoyed' }, { e: '😬', n: 'grimacing awkward' }, { e: '🤥', n: 'lying pinocchio nose' },
  { e: '😌', n: 'relieved calm peaceful' }, { e: '😔', n: 'pensive sad thoughtful' }, { e: '😪', n: 'sleepy tired' },
  { e: '🤤', n: 'drooling yum' }, { e: '😴', n: 'sleeping zzz tired' }, { e: '😷', n: 'mask sick medical' },
  { e: '🤒', n: 'thermometer sick fever' }, { e: '🤕', n: 'bandage hurt injured' }, { e: '🤢', n: 'nauseated sick green' },
  { e: '🤮', n: 'vomiting sick throw up' }, { e: '🥵', n: 'hot face sweating' }, { e: '🥶', n: 'cold face freezing' },
  { e: '🥴', n: 'woozy drunk dizzy' }, { e: '😵', n: 'dizzy face' }, { e: '🤯', n: 'exploding head mind blown' },
  { e: '🤠', n: 'cowboy hat yeehaw' }, { e: '🥳', n: 'partying celebration' }, { e: '🥸', n: 'disguised face' },
  { e: '😎', n: 'sunglasses cool' }, { e: '🤓', n: 'nerd glasses smart' }, { e: '🧐', n: 'monocle inspect' },
  // Gestures
  { e: '👍', n: 'thumbs up good yes like approve' }, { e: '👎', n: 'thumbs down bad no dislike' },
  { e: '👌', n: 'ok okay perfect' }, { e: '🤌', n: 'pinched fingers italian' },
  { e: '🤏', n: 'pinching small little' }, { e: '✌️', n: 'victory peace sign' },
  { e: '🤞', n: 'crossed fingers luck hope' }, { e: '🫰', n: 'hand with index and thumb crossed' },
  { e: '🤟', n: 'love you gesture rock' }, { e: '🤘', n: 'rock on metal horns' },
  { e: '🤙', n: 'call me hand shaka' }, { e: '🫵', n: 'pointing at you' },
  { e: '👈', n: 'pointing left' }, { e: '👉', n: 'pointing right' },
  { e: '👆', n: 'pointing up' }, { e: '👇', n: 'pointing down' },
  { e: '☝️', n: 'index pointing up one' }, { e: '✋', n: 'raised hand stop high five' },
  { e: '🤚', n: 'raised back of hand' }, { e: '🖐️', n: 'hand fingers splayed' },
  { e: '🖖', n: 'vulcan salute spock' }, { e: '👋', n: 'waving hand hello bye' },
  { e: '🤝', n: 'handshake deal agreement' }, { e: '🙏', n: 'folded hands pray please thank you' },
  { e: '💪', n: 'flexed biceps strong muscle' }, { e: '🫶', n: 'heart hands love' },
  { e: '❤️', n: 'red heart love' }, { e: '🔥', n: 'fire hot lit flame' },
  { e: '⭐', n: 'star favorite' }, { e: '💯', n: 'hundred perfect score' },
  { e: '✅', n: 'check mark done complete' }, { e: '❌', n: 'cross mark wrong no delete' },
  { e: '⚡', n: 'lightning bolt zap energy' }, { e: '💡', n: 'light bulb idea' },
  { e: '🎉', n: 'party popper celebration tada' }, { e: '🎊', n: 'confetti ball celebration' },
  { e: '👏', n: 'clapping hands applause bravo' }, { e: '🙌', n: 'raising hands hooray celebration' },
  { e: '🫡', n: 'saluting respect salute honor' },
  // Objects
  { e: '💼', n: 'briefcase work business' }, { e: '📁', n: 'folder file' },
  { e: '📂', n: 'open folder file' }, { e: '📋', n: 'clipboard list task' },
  { e: '📌', n: 'pushpin pin location' }, { e: '📎', n: 'paperclip attach' },
  { e: '📝', n: 'memo note write' }, { e: '✏️', n: 'pencil edit write' },
  { e: '📅', n: 'calendar date schedule' }, { e: '📆', n: 'tear off calendar date' },
  { e: '🗓️', n: 'spiral calendar date' }, { e: '⏰', n: 'alarm clock time' },
  { e: '⏳', n: 'hourglass time loading' }, { e: '📊', n: 'bar chart analytics data' },
  { e: '📈', n: 'chart increasing up growth' }, { e: '📉', n: 'chart decreasing down decline' },
  { e: '🔔', n: 'bell notification alert' }, { e: '🔕', n: 'bell slash mute silent' },
  { e: '💬', n: 'speech bubble chat message' }, { e: '💭', n: 'thought bubble think' },
  { e: '🗨️', n: 'left speech bubble chat' }, { e: '📢', n: 'loudspeaker announcement' },
  { e: '📣', n: 'megaphone announce shout' }, { e: '🏷️', n: 'label tag price' },
  { e: '🔖', n: 'bookmark save' }, { e: '🔗', n: 'link chain url' },
  { e: '📧', n: 'email envelope mail' }, { e: '✉️', n: 'envelope letter mail' },
  { e: '📩', n: 'envelope with arrow incoming mail' }, { e: '📨', n: 'incoming envelope mail' },
  { e: '📤', n: 'outbox tray send upload' }, { e: '📥', n: 'inbox tray receive download' },
  { e: '📦', n: 'package box parcel' },
  // Symbols
  { e: '🧡', n: 'orange heart love' }, { e: '💛', n: 'yellow heart love' },
  { e: '💚', n: 'green heart love' }, { e: '💙', n: 'blue heart love' },
  { e: '💜', n: 'purple heart love' }, { e: '🖤', n: 'black heart love dark' },
  { e: '🤍', n: 'white heart love pure' }, { e: '🤎', n: 'brown heart love' },
  { e: '💔', n: 'broken heart sad heartbreak' }, { e: '❣️', n: 'heart exclamation love' },
  { e: '💕', n: 'two hearts love' }, { e: '💞', n: 'revolving hearts love' },
  { e: '💓', n: 'beating heart love' }, { e: '💗', n: 'growing heart love' },
  { e: '💖', n: 'sparkling heart love' }, { e: '💘', n: 'heart with arrow love cupid' },
  { e: '💝', n: 'heart with ribbon gift love' }, { e: '🌟', n: 'glowing star shine bright' },
  { e: '💫', n: 'dizzy star sparkle' }, { e: '✨', n: 'sparkles magic shine' },
  { e: '💥', n: 'collision boom explosion' }, { e: '❗', n: 'exclamation mark important' },
  { e: '❓', n: 'question mark help' }, { e: '💤', n: 'zzz sleep tired' },
  { e: '💢', n: 'anger symbol angry' }, { e: '💦', n: 'sweat droplets water' },
  { e: '🎵', n: 'musical note music' }, { e: '🎶', n: 'musical notes music' },
]

// Build category index for tab navigation
const CATEGORY_RANGES = {
  'Smileys': { start: 0, end: 63 },
  'Gestures': { start: 63, end: 102 },
  'Objects': { start: 102, end: 133 },
  'Symbols': { start: 133, end: EMOJI_DATA.length },
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

  const filtered = useMemo(() => {
    if (search) {
      const q = search.toLowerCase()
      return EMOJI_DATA
        .filter((d) => d.n.includes(q))
        .map((d) => d.e)
        .slice(0, 40)
    }
    const range = CATEGORY_RANGES[activeCategory]
    if (!range) return []
    return EMOJI_DATA.slice(range.start, range.end).map((d) => d.e)
  }, [search, activeCategory])

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
          {Object.keys(CATEGORY_RANGES).map((cat) => (
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
          {filtered.map((emoji, i) => {
            const meta = EMOJI_DATA.find((d) => d.e === emoji)
            const tooltip = meta ? meta.n.split(' ').slice(0, 3).join(' ') : emoji
            return (
              <button
                key={`${emoji}-${i}`}
                onClick={() => { onSelect(emoji); onClose?.() }}
                title={tooltip}
              >
                {emoji}
              </button>
            )
          })}
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
