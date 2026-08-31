import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useChannelStore } from '../stores/channelStore'

/**
 * Centralized mention system hook.
 *
 * Responsibilities:
 * - Fetch eligible conversation participants
 * - Detect @ trigger + query from cursor position
 * - Calculate dropdown position relative to cursor
 * - Search/filter members by query
 * - Build mention payload
 * - Insert mention node into editor
 * - Manage dropdown open/close state
 * - Keyboard navigation (ArrowUp/Down, Enter, Escape)
 *
 * Single source of truth for ALL mention interactions:
 *   - Chat Input  (MessageInput)
 *   - Thread Reply (MessageInput via ThreadPanel)
 *   - Edit Message (InlineEditor)
 *   - Any future composer
 *
 * @param {object} options
 * @param {string} options.channelId - Current channel ID
 * @param {React.RefObject} options.editorRef - Ref to RichTextEditor imperative handle
 * @param {object} [options.options] - Additional config
 * @returns {object} Mention state + handlers
 */
export function useMentions({ channelId, editorRef }) {
  // ─── State ────────────────────────────────────────────────────────────────
  const [mentionType, setMentionType] = useState(null) // 'user' | 'channel' | null
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionPos, setMentionPos] = useState({ top: 0, left: 0 })
  const [activeIndex, setActiveIndex] = useState(0)

  // Stable refs to avoid stale closures
  const mentionTypeRef = useRef(null)
  const mentionQueryRef = useRef('')
  const activeIndexRef = useRef(0)

  // Keep refs in sync
  useEffect(() => { mentionTypeRef.current = mentionType }, [mentionType])
  useEffect(() => { mentionQueryRef.current = mentionQuery }, [mentionQuery])
  useEffect(() => { activeIndexRef.current = activeIndex }, [activeIndex])

  // ─── Members from store ───────────────────────────────────────────────────
  const members = useChannelStore(
    useCallback((s) => s.membersByChannel[channelId], [channelId])
  ) ?? []

  const channels = useChannelStore((s) => s.channels) ?? []

  // ─── Fetch members when channel changes ───────────────────────────────────
  const fetchMembers = useChannelStore((s) => s.fetchMembers)
  useEffect(() => {
    if (channelId) {
      fetchMembers(channelId)
    }
  }, [channelId, fetchMembers])

  // ─── Memoized filtered items ──────────────────────────────────────────────
  const items = useMemo(() => {
    if (mentionType === 'user') {
      if (!members || members.length === 0) return []
      const q = mentionQuery.toLowerCase()
      return members
        .filter((m) => {
          if (!q) return true
          const name = (m.name || m.userId?.name || '').toLowerCase()
          const email = (m.email || m.userId?.email || '').toLowerCase()
          return name.includes(q) || email.includes(q)
        })
        .slice(0, 8)
        .map((m) => ({
          id: m._id || m.userId?._id || m.userId,
          name: m.name || m.userId?.name || 'Unknown',
          avatar: m.avatar || m.userId?.avatar,
          type: 'user',
        }))
    }

    if (mentionType === 'channel') {
      if (!channels || channels.length === 0) return []
      const q = mentionQuery.toLowerCase()
      return channels
        .filter((c) => {
          if (!q) return true
          return (c.name || '').toLowerCase().includes(q)
        })
        .slice(0, 8)
        .map((c) => ({
          id: c._id,
          name: c.name,
          type: 'channel',
        }))
    }

    return []
  }, [mentionType, mentionQuery, members, channels])

  // ─── Close mention dropdown ───────────────────────────────────────────────
  const closeMentions = useCallback(() => {
    setMentionType(null)
    setMentionQuery('')
    setActiveIndex(0)
  }, [])

  // ─── Detect @mention trigger from cursor position ─────────────────────────
  const detectMention = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return

    const textBefore = ed.getTextBeforeCursor()
    if (!textBefore) {
      closeMentions()
      return
    }

    // Look backwards for @ or # trigger
    const match = textBefore.match(/([@#])([^\s@#]*)$/)
    if (match) {
      const triggerChar = match[1]
      const query = match[2]
      const newType = triggerChar === '@' ? 'user' : 'channel'
      setMentionType(newType)
      setMentionQuery(query)
      setActiveIndex(0)

      try {
        const tiptap = ed.getEditor()
        if (tiptap) {
          const coords = tiptap.view.coordsAtPos(tiptap.state.selection.from)
          // Position below cursor with small offset
          setMentionPos({
            top: coords.top + 24,
            left: coords.left,
          })
        } else {
          setMentionPos({ top: 0, left: 0 })
        }
      } catch {
        setMentionPos({ top: 0, left: 0 })
      }
    } else {
      closeMentions()
    }
  }, [editorRef, closeMentions])

  // ─── Select a mention item ────────────────────────────────────────────────
  const selectMention = useCallback(
    (item) => {
      const ed = editorRef.current
      if (!ed) return

      const tiptap = ed.getEditor()
      if (!tiptap) return

      // Delete the trigger character + query text
      const textBefore = ed.getTextBeforeCursor()
      const match = textBefore.match(/([@#])([^\s@#]*)$/)
      if (match) {
        const deleteCount = match[0].length
        const { from } = tiptap.state.selection
        tiptap
          .chain()
          .focus()
          .deleteRange({ from: from - deleteCount, to: from })
          .run()
      }

      // Insert mention node
      ed.insertMention(
        item.id,
        item.name,
        item.type === 'user' ? 'user' : 'channel',
      )
      closeMentions()
    },
    [editorRef, closeMentions],
  )

  // ─── Keyboard navigation handler ──────────────────────────────────────────
  const handleMentionKeyDown = useCallback(
    (event) => {
      const type = mentionTypeRef.current
      if (!type) return false

      const currentItems = items
      if (currentItems.length === 0) return false

      const idx = activeIndexRef.current

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          event.stopPropagation()
          setActiveIndex((prev) => (prev + 1) % currentItems.length)
          return true

        case 'ArrowUp':
          event.preventDefault()
          event.stopPropagation()
          setActiveIndex(
            (prev) => (prev - 1 + currentItems.length) % currentItems.length,
          )
          return true

        case 'Enter':
        case 'Tab':
          if (currentItems[idx]) {
            event.preventDefault()
            event.stopPropagation()
            selectMention(currentItems[idx])
            return true
          }
          return false

        case 'Escape':
          event.preventDefault()
          event.stopPropagation()
          closeMentions()
          return true

        default:
          return false
      }
    },
    [items, selectMention, closeMentions],
  )

  // ─── Reset active index when items/query change ───────────────────────────
  useEffect(() => {
    setActiveIndex(0)
  }, [items.length, mentionQuery])

  return {
    // State
    mentionType,
    mentionQuery,
    mentionPos,
    activeIndex,
    items,

    // Actions
    detectMention,
    selectMention,
    closeMentions,
    setActiveIndex,

    // Keyboard handler (call from parent's onKeyDown)
    handleMentionKeyDown,
  }
}

export default useMentions