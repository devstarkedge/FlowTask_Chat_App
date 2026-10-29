import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useChannelStore } from '../stores/channelStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useUserProfileStore } from '../stores/userProfileStore'
import { useLiveProfileData } from './useLiveProfileData'

const EMPTY_ARRAY = []
const EMPTY_PROFILES = {}

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
 * @param {string|object} options.channelId - Current channel ID
 * @param {React.RefObject} options.editorRef - Ref to RichTextEditor imperative handle
 * @param {object} [options.options] - Additional config
 * @returns {object} Mention state + handlers
 */
export function useMentions({ channelId, editorRef }) {
  const safeChannelId = typeof channelId === 'object' ? channelId?._id : channelId

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
  const storedMembers = useChannelStore(
    useCallback((s) => (safeChannelId && s.membersByChannel?.[safeChannelId]) ? s.membersByChannel[safeChannelId] : EMPTY_ARRAY, [safeChannelId])
  )
  const members = useLiveProfileData(storedMembers)

  const channels = useChannelStore((s) => s.channels || EMPTY_ARRAY)
  const workspaceMembers = useWorkspaceStore((s) => s.members || EMPTY_ARRAY)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaceProfiles = useUserProfileStore(
    useCallback((s) => (activeWorkspaceId && s.profilesByWorkspace?.[activeWorkspaceId]) ? s.profilesByWorkspace[activeWorkspaceId] : EMPTY_PROFILES, [activeWorkspaceId])
  )

  // ─── Fetch members when channel changes ───────────────────────────────────
  const fetchMembers = useChannelStore((s) => s.fetchMembers)
  const fetchWorkspaceMembers = useWorkspaceStore((s) => s.fetchMembers)

  useEffect(() => {
    if (safeChannelId) {
      fetchMembers(safeChannelId)
    }
  }, [safeChannelId, fetchMembers])

  const hasFetchedWorkspaceMembersRef = useRef(false)
  useEffect(() => {
    hasFetchedWorkspaceMembersRef.current = false
  }, [activeWorkspaceId])

  useEffect(() => {
    if (activeWorkspaceId && !hasFetchedWorkspaceMembersRef.current && (!workspaceMembers || workspaceMembers.length === 0)) {
      hasFetchedWorkspaceMembersRef.current = true
      fetchWorkspaceMembers(activeWorkspaceId)?.catch?.(() => {})
    }
  }, [activeWorkspaceId, fetchWorkspaceMembers])

  // ─── Memoized filtered items ──────────────────────────────────────────────
  const items = useMemo(() => {
    if (mentionType === 'user') {
      const q = mentionQuery.toLowerCase()
      const candidateMap = new Map()

      // Special broadcast mention: @channel
      const specialItems = []
      if (!q || 'channel'.includes(q) || 'everyone'.includes(q)) {
        specialItems.push({
          id: 'channel',
          name: 'channel',
          displayName: 'channel',
          description: 'Notify everyone in this channel',
          type: 'channel',
          isSpecial: true,
        })
      }

      // 1. Channel members (highest priority)
      if (Array.isArray(members) && members.length > 0) {
        members.forEach((m) => {
          const u = m.userId && typeof m.userId === 'object' ? m.userId : (m.user && typeof m.user === 'object' ? m.user : m)
          const id = String(u._id || u.id || m._id || m.userId || '')
          const rawName = u.name || m.name || u.displayName || u.username || m.username || (u.email ? u.email.split('@')[0] : '') || ''
          const name = rawName && rawName !== 'null' && rawName !== 'undefined' ? rawName : (u.email ? u.email.split('@')[0] : 'User')
          if (id && name && name !== 'null') {
            candidateMap.set(id, {
              id,
              name,
              avatar: u.avatar || m.avatar,
              email: u.email || m.email || '',
              type: 'user',
            })
          }
        })
      }

      // 2. Workspace members (supplement/fallback)
      if (Array.isArray(workspaceMembers) && workspaceMembers.length > 0) {
        workspaceMembers.forEach((m) => {
          const u = m.userId && typeof m.userId === 'object' ? m.userId : (m.user && typeof m.user === 'object' ? m.user : m)
          const id = String(u._id || u.id || m._id || m.userId || '')
          const rawName = u.name || m.name || u.displayName || u.username || m.username || (u.email ? u.email.split('@')[0] : '') || ''
          const name = rawName && rawName !== 'null' && rawName !== 'undefined' ? rawName : (u.email ? u.email.split('@')[0] : 'User')
          if (id && name && name !== 'null' && !candidateMap.has(id)) {
            candidateMap.set(id, {
              id,
              name,
              avatar: u.avatar || m.avatar,
              email: u.email || m.email || '',
              type: 'user',
            })
          }
        })
      }

      // 3. Workspace profiles fallback
      if (workspaceProfiles && Object.keys(workspaceProfiles).length > 0) {
        Object.values(workspaceProfiles).forEach((p) => {
          const id = String(p._id || p.id || '')
          const rawName = p.name || p.displayName || p.username || (p.email ? p.email.split('@')[0] : '') || ''
          const name = rawName && rawName !== 'null' && rawName !== 'undefined' ? rawName : (p.email ? p.email.split('@')[0] : 'User')
          if (id && name && name !== 'null' && !candidateMap.has(id)) {
            candidateMap.set(id, {
              id,
              name,
              avatar: p.avatar,
              email: p.email || '',
              type: 'user',
            })
          }
        })
      }

      const filtered = Array.from(candidateMap.values())
        .filter((m) => {
          if (!q) return true
          return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
        })
        .slice(0, 8)

      return [...specialItems, ...filtered]
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
  }, [mentionType, mentionQuery, members, workspaceMembers, workspaceProfiles, channels])

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

      // Find the trigger character + query text to replace
      const textBefore = ed.getTextBeforeCursor()
      const match = textBefore.match(/([@#])([^\s@#]*)$/)
      const deleteCount = match ? match[0].length : 0
      const { from } = tiptap.state.selection
      const startPos = Math.max(0, from - deleteCount)

      // Insert mention node and replace the trigger query atomically
      ed.insertMention(
        item.id,
        item.name,
        item.isSpecial ? 'channel' : (item.type === 'user' ? 'user' : 'channel'),
        deleteCount > 0 ? { from: startPos, to: from } : null,
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