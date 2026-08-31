import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Forward, Hash, MessageCircle, Lock, Check, Paperclip, FileText, Image, Film, Music, Archive, CheckSquare, Square, Users, Send } from 'lucide-react';
import Loader from '../shared/Loader';
import toast from 'react-hot-toast'
import { useChannelStore } from '../../stores/channelStore'
import { useAuthStore } from '../../stores/authStore'
import { messageAPI, channelAPI, userAPI } from '../../services/api'
import logger from '../../utils/logger'
import { Avatar } from './MemberAvatarGroup'


/**
 * ForwardMessageModal — select one or more channels/DMs to forward message(s) to.
 * Accepts `messages` (array) for multi-message or `message` (single) for single-message forwarding.
 * `attachmentFileIds` — optional array of file IDs to forward (when forwarding a single file
 *   from a multi-file message, the backend filters file references to only these IDs).
 * DM names are derived from `channel.name` which is already decorated by the backend.
 *
 * When 2+ recipients are selected and at least one is a DM, an Instagram-style toggle
 * lets the user choose between "Send Separately" (default) and "Create a Group".
 */
export default function ForwardMessageModal({ message, messages, attachmentFileIds, onClose, onForwardComplete }) {
  const { user } = useAuthStore()
  const channels = useChannelStore((s) => s.channels)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [isForwarding, setIsForwarding] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [sendMode, setSendMode] = useState('separate') // 'separate' | 'group'
  const [groupName, setGroupName] = useState('')
  const [customMessage, setCustomMessage] = useState('')
  const [serverChannels, setServerChannels] = useState([])
  const [serverContacts, setServerContacts] = useState([])
  const [isLoadingResults, setIsLoadingResults] = useState(false)
  const searchInputRef = useRef(null)
  const groupNameRef = useRef(null)

  // Normalise to array
  const messagesToForward = useMemo(() => {
    if (messages && Array.isArray(messages) && messages.length > 0) return messages
    if (message) return [message]
    return []
  }, [message, messages])

  const isMulti = messagesToForward.length > 1

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
    searchInputRef.current?.focus()
  }, [])

  useEffect(() => {
    let active = true
    const fetchResults = async () => {
      setIsLoadingResults(true)
      try {
        const [channelsRes, contactsRes] = await Promise.all([
          channelAPI.search(searchQuery),
          userAPI.getDMContacts(searchQuery),
        ])
        if (active) {
          setServerChannels(channelsRes.data?.data?.channels || [])
          setServerContacts(contactsRes.data?.data?.contacts || [])
        }
      } catch (err) {
        logger.error('Failed to fetch forward destinations:', err)
      } finally {
        if (active) setIsLoadingResults(false)
      }
    }

    const timer = setTimeout(() => {
      fetchResults()
    }, searchQuery ? 250 : 0)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [searchQuery])

  // Merge and deduplicate results
  const displayResults = useMemo(() => {
    if (!searchQuery.trim()) {
      const regularChannels = channels.filter((c) => !c.isArchived && !c.isAI);
      const aiChannels = channels.filter((c) => !c.isArchived && c.isAI);

      // Keep only the most recent AI channel if multiple exist
      const validAiChannel = aiChannels.sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      })[0];

      const merged = [...regularChannels];
      if (validAiChannel) {
        merged.push(validAiChannel);
      }

      return merged.sort((a, b) => {
        if (a.type === 'dm' && b.type !== 'dm') return -1
        if (a.type !== 'dm' && b.type === 'dm') return 1
        return (a.name || '').localeCompare(b.name || '')
      })
    }

    const mergedResults = []
    const existingDmRecipientIds = new Set()

    const serverAiChannels = serverChannels.filter((c) => c.isAI);
    const validServerAiChannel = serverAiChannels.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    })[0];

    serverChannels.forEach((c) => {
      if (c.isAI && c._id !== validServerAiChannel?._id) return;
      if (c.type === 'dm' && Array.isArray(c.dmParticipants)) {
        const recipientId = c.dmParticipants.find((p) => p !== user?._id)
        if (recipientId) {
          existingDmRecipientIds.add(recipientId.toString())
        }
      }
      mergedResults.push(c)
    })

    serverContacts.forEach((contact) => {
      const contactChatUserId = contact.chatUserId
      const contactFlowTaskUserId = contact.flowTaskUserId

      if (contactChatUserId === user?._id) return
      if (contactFlowTaskUserId === user?.flowTaskUserId) return

      if (contactChatUserId && existingDmRecipientIds.has(contactChatUserId.toString())) {
        return
      }

      mergedResults.push({
        _id: `user:${contactChatUserId || contactFlowTaskUserId}`,
        name: contact.name,
        avatar: contact.avatar || null,
        type: 'dm',
        onlineStatus: contact.onlineStatus || 'offline',
        isNewDM: true,
        chatUserId: contactChatUserId,
        flowTaskUserId: contactFlowTaskUserId,
      })
    })

    return mergedResults
  }, [channels, searchQuery, serverChannels, serverContacts, user])

  const filteredChannels = displayResults

  const toggleSelection = useCallback((channelId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(channelId)) next.delete(channelId)
      else next.add(channelId)
      return next
    })
  }, [])

  // Determine if the "Create a Group" toggle should be visible
  const selectedChannels = useMemo(() => {
    return Array.from(selectedIds).map((id) => {
      let ch = displayResults.find((c) => c._id === id)
      if (!ch) ch = channels.find((c) => c._id === id)
      return ch
    }).filter(Boolean)
  }, [selectedIds, displayResults, channels])

  const selectedDMs = useMemo(() => selectedChannels.filter((c) => c.type === 'dm'), [selectedChannels])
  const showModeToggle = selectedDMs.length >= 1

  // Reset mode when toggle disappears
  useEffect(() => {
    if (!showModeToggle && sendMode !== 'separate') {
      setSendMode('separate')
    }
  }, [showModeToggle, sendMode])

  // Focus group name input when switching to group mode
  useEffect(() => {
    if (sendMode === 'group') {
      setTimeout(() => groupNameRef.current?.focus(), 150)
    }
  }, [sendMode])

  // Extract user IDs from DM channels for group creation
  const extractedMemberIds = useMemo(() => {
    if (sendMode !== 'group') return []
    const currentUserId = user?._id
    return selectedDMs
      .map((dm) => {
        if (dm.isNewDM) {
          return dm.chatUserId || dm.flowTaskUserId
        }
        const participants = Array.isArray(dm.dmParticipants) ? dm.dmParticipants : []
        // Find the OTHER user in this DM (not the current user)
        const otherId = participants.find((p) => {
          const pId = typeof p === 'object' ? p.toString() : p
          return pId !== currentUserId
        })
        return otherId ? (typeof otherId === 'object' ? otherId.toString() : otherId) : null
      })
      .filter(Boolean)
  }, [sendMode, selectedDMs, user?._id])

  const handleForward = useCallback(async () => {
    if (selectedIds.size === 0 || messagesToForward.length === 0) return
    setIsForwarding(true)
    try {
      const messageId = messagesToForward[0]._id
      const messageIds = isMulti ? messagesToForward.map(m => m._id) : undefined
      const trimmedCustom = customMessage.trim() || undefined

      if (sendMode === 'group' && extractedMemberIds.length > 0) {
        // ── Create a Group & Forward ──
        const res = await messageAPI.forwardToNewGroup(
          messageId,
          extractedMemberIds,
          groupName.trim() || undefined,
          messageIds,
          attachmentFileIds,
          trimmedCustom,
        )
        const newChannel = res.data?.data?.channel
        const newChannelId = newChannel?._id
        toast.success('Group created & message forwarded')
        if (newChannel && onForwardComplete) {
          useChannelStore.getState().addChannel(newChannel)
          onForwardComplete(newChannelId)
        } else {
          onClose()
        }
      } else {
        // ── Send Separately (existing behavior) ──
        const destinationIds = []
        for (const destId of Array.from(selectedIds)) {
          if (destId.startsWith('user:')) {
            const targetUserId = destId.replace('user:', '')
            const channel = await useChannelStore.getState().createDM(targetUserId)
            destinationIds.push(channel._id)
          } else {
            destinationIds.push(destId)
          }
        }

        let res;
        if (isMulti) {
          res = await messageAPI.forwardBulk(messagesToForward.map(m => m._id), destinationIds, trimmedCustom)
        } else {
          res = await messageAPI.forward(messageId, destinationIds, attachmentFileIds, trimmedCustom)
        }
        
        const createdMessages = res.data?.data?.messages || []
        const finalChannelId = createdMessages[0]?.channelId || destinationIds[0]
        const msgLabel = isMulti ? `${messagesToForward.length} messages` : 'Message'

        if (destinationIds.length === 1) {
          // Single destination: navigate to conversation (no toast — parent handles it)
          if (onForwardComplete) {
            onForwardComplete(finalChannelId)
          } else {
            onClose()
          }
        } else {
          // Multiple destinations: stay on current chat, show toast
          toast.success(`${msgLabel} forwarded to ${destinationIds.length} conversations`)
          onClose()
        }
      }
    } catch (err) {
      logger.error('Forward message failed:', err)
      toast.error(err.response?.data?.error?.message || 'Failed to forward message')
      setIsForwarding(false)
    }
  }, [selectedIds, messagesToForward, isMulti, attachmentFileIds, onClose, sendMode, extractedMemberIds, groupName, customMessage, onForwardComplete])

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose()
  }

  // Build preview content for the modal
  const previewData = useMemo(() => {
    if (messagesToForward.length === 0) return { text: '', totalAttachments: 0 }
    if (messagesToForward.length === 1) {
      const msg = messagesToForward[0]
      const text = msg.content
        ? (msg.content.length > 150 ? msg.content.slice(0, 150) + '...' : msg.content)
        : ''
      return { text, totalAttachments: (msg.attachments || []).length, attachments: msg.attachments || [] }
    }
    // Multi-message summary
    const totalAttachments = messagesToForward.reduce(
      (sum, m) => sum + (m.attachments?.length || 0), 0
    )
    return { text: `${messagesToForward.length} messages selected`, totalAttachments, attachments: [] }
  }, [messagesToForward])

  const getChannelLabel = (c) => {
    // channel.name is already decorated by _decorateDMChannels (recipient name for DMs)
    if (c.type === 'dm') {
      return c.name || 'Direct Message'
    }
    return c.name || 'Unnamed'
  }

  const getChannelIcon = (c) => {
    if (c.type === 'dm') return <MessageCircle size={14} />
    if (c.type === 'private' || c.visibility === 'private') return <Lock size={14} />
    return <Hash size={14} />
  }

  // Button label changes based on mode
  const forwardButtonLabel = useMemo(() => {
    if (isForwarding) return 'Forwarding...'
    if (sendMode === 'group' && showModeToggle) {
      return `Create Group & Forward`
    }
    return `Forward${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`
  }, [isForwarding, sendMode, showModeToggle, selectedIds.size])

  if (messagesToForward.length === 0) return null

  return createPortal(
    <>
      <style>{`
        @keyframes fm-overlay-in {
          from { opacity: 0; backdrop-filter: blur(0px); }
          to   { opacity: 1; backdrop-filter: blur(8px); }
        }
        @keyframes fm-modal-in {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fm-spin { to { transform: rotate(360deg); } }
        @keyframes chip-scale-in {
          from { transform: scale(0.85); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes check-pop {
          0% { transform: scale(0.8); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        .fm-overlay {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          background: rgba(10, 10, 20, 0.45);
          backdrop-filter: blur(8px) saturate(140%);
          -webkit-backdrop-filter: blur(8px) saturate(140%);
          animation: fm-overlay-in 0.24s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .fm-modal {
          width: 100%; max-width: 480px; margin: 0 1rem;
          max-height: min(85vh, 700px);
          display: flex; flex-direction: column;
          background: var(--bg-modal, var(--bg-secondary, #151259));
          border: 1px solid var(--border-primary, rgba(255, 255, 255, 0.08));
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4), 
                      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
          animation: fm-modal-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .fm-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 20px 14px;
          border-bottom: 1px solid var(--border-secondary, rgba(255,255,255,0.06));
          flex-shrink: 0;
        }
        .fm-title { 
          font-size: 16px; font-weight: 700; 
          color: var(--text-white, #f1f1f1); 
          letter-spacing: -0.015em; margin: 0; 
        }
        .fm-subtitle { font-size: 12px; color: var(--text-muted, #888); margin: 3px 0 0; }
        .fm-close {
          width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: none; cursor: pointer;
          color: var(--text-muted, #888);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
        }
        .fm-close:hover { 
          background: var(--bg-hover, rgba(255,255,255,0.08)); 
          color: var(--text-white, #f1f1f1); 
          transform: rotate(90deg);
        }
        .fm-preview {
          margin: 14px 20px 0;
          padding: 12px 16px;
          border-radius: 12px;
          background: var(--bg-card, rgba(255,255,255,0.03));
          border: 1px solid var(--border-secondary, rgba(255,255,255,0.05));
          border-left: 3px solid var(--accent-primary, #4e7cff);
          flex-shrink: 0;
        }
        .fm-preview-label {
          font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
          text-transform: uppercase; color: var(--accent-primary, #4e7cff);
          margin-bottom: 6px; display: flex; align-items: center; gap: 6px;
        }
        .fm-preview-text {
          font-size: 13px; color: var(--text-primary, #ddd);
          line-height: 1.5; word-break: break-word;
          max-height: 80px; overflow-y: auto;
        }
        .fm-preview-attachments {
          display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;
        }
        .fm-preview-att {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; color: var(--text-secondary, #aaa);
          padding: 4px 10px; border-radius: 8px;
          background: var(--bg-hover, rgba(255,255,255,0.05));
          border: 1px solid var(--border-primary, rgba(255,255,255,0.06));
          transition: all 0.2s ease;
        }
        .fm-preview-att:hover {
          border-color: var(--accent-primary);
          color: var(--text-primary);
        }
        .fm-custom-message-wrap {
          margin: 14px 20px 0;
          flex-shrink: 0;
        }
        .fm-custom-message-input {
          width: 100%; box-sizing: border-box;
          padding: 12px 14px;
          min-height: 60px; max-height: 120px;
          background: var(--bg-input, rgba(255,255,255,0.04));
          border: 1px solid var(--border-primary, rgba(255,255,255,0.06));
          border-radius: 12px;
          font-size: 13px;
          color: var(--text-primary, #ddd);
          outline: none;
          resize: none;
          caret-color: var(--accent-primary, #5865f2);
          transition: all 0.2s ease;
        }
        .fm-custom-message-input::placeholder { color: var(--text-muted, #666); }
        .fm-custom-message-input:focus {
          border-color: var(--accent-primary, #5865f2);
          box-shadow: 0 0 0 3px rgba(78, 124, 255, 0.15);
          background: var(--bg-input, rgba(255,255,255,0.06));
        }
        .fm-search-wrap {
          padding: 14px 20px 8px;
          flex-shrink: 0;
        }
        .fm-search-box {
          display: flex; align-items: center; gap: 10px;
          padding: 0 14px; height: 42px;
          background: var(--bg-input, rgba(255,255,255,0.05));
          border: 1px solid var(--border-primary, rgba(255,255,255,0.08));
          border-radius: 12px;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .fm-search-box:focus-within {
          border-color: var(--accent-primary, #5865f2);
          background: var(--bg-input);
          box-shadow: 0 0 0 3px rgba(78, 124, 255, 0.15);
        }
        .fm-search-input {
          flex: 1; background: transparent; border: none; outline: none;
          font-size: 13px; color: var(--text-primary, #ddd);
          caret-color: var(--accent-primary, #5865f2);
        }
        .fm-search-input::placeholder { color: var(--text-muted, #666); }
        .fm-selected-bar {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          padding: 0 20px 14px;
          flex-shrink: 0; min-height: 36px;
        }
        .fm-selected-chip {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 500;
          padding: 4px 10px; border-radius: 20px;
          background: rgba(78, 124, 255, 0.08);
          color: var(--accent-primary, #5865f2);
          border: 1px solid rgba(78, 124, 255, 0.15);
          animation: chip-scale-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          transition: all 0.15s ease;
        }
        .fm-selected-chip:hover {
          background: rgba(78, 124, 255, 0.12);
          border-color: rgba(78, 124, 255, 0.25);
        }
        .fm-selected-chip button {
          display: flex; align-items: center; justify-content: center;
          background: rgba(78, 124, 255, 0.15); border: none; cursor: pointer;
          color: inherit; padding: 2px; margin-left: 2px;
          border-radius: 50%;
          transition: all 0.15s ease;
        }
        .fm-selected-chip button:hover {
          background: rgba(78, 124, 255, 0.3);
          color: var(--text-white, #fff);
        }
        .fm-selected-label { 
          font-size: 11px; font-weight: 600; 
          color: var(--text-muted, #666); 
          text-transform: uppercase; letter-spacing: 0.05em; 
        }
        .fm-list { flex: 1; overflow-y: auto; padding: 8px 12px; }
        .fm-list::-webkit-scrollbar { width: 6px; }
        .fm-list::-webkit-scrollbar-track { background: transparent; }
        .fm-list::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb, rgba(255,255,255,0.1)); border-radius: 4px; }
        .fm-list::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover, rgba(255,255,255,0.2)); }
        
        .fm-channel-btn {
          display: flex; align-items: center; gap: 12px;
          width: 100%; padding: 10px 12px;
          background: transparent; border: none;
          border-radius: 10px;
          cursor: pointer; text-align: left;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          margin-bottom: 2px;
        }
        .fm-channel-btn:hover { 
          background: var(--bg-hover, rgba(255,255,255,0.04)); 
          transform: translateX(2px);
        }
        .fm-channel-btn:active {
          transform: scale(0.99) translateX(2px);
        }
        .fm-channel-icon {
          width: 36px; height: 36px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          background: var(--bg-tertiary, rgba(255,255,255,0.06));
          color: var(--text-secondary, #aaa);
          flex-shrink: 0;
          transition: all 0.2s ease;
        }
        .fm-channel-btn:hover .fm-channel-icon {
          background: rgba(78, 124, 255, 0.1);
          color: var(--accent-primary, #4e7cff);
        }
        .fm-channel-avatar {
          width: 36px; height: 36px; border-radius: 50%;
          object-fit: cover; flex-shrink: 0;
          border: 1.5px solid var(--border-secondary, transparent);
          transition: all 0.2s ease;
        }
        .fm-channel-btn:hover .fm-channel-avatar {
          border-color: var(--accent-primary, #4e7cff);
        }
        .fm-channel-name {
          font-size: 13px; font-weight: 600;
          color: var(--text-primary, #f1f1f1);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 260px;
        }
        .fm-channel-type { font-size: 11px; color: var(--text-muted, #888); margin-top: 1px; }
        .fm-checkbox {
          width: 20px; height: 20px; border-radius: 6px;
          border: 2px solid var(--border-primary, rgba(255,255,255,0.2));
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          background: transparent;
          color: transparent;
        }
        .fm-channel-btn:hover .fm-checkbox:not(.is-checked) {
          border-color: var(--text-secondary);
        }
        .fm-checkbox.is-checked {
          background: var(--accent-primary, #5865f2);
          border-color: var(--accent-primary, #5865f2);
          color: #fff;
          animation: check-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .fm-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 60px 20px; gap: 10px;
          color: var(--text-muted, #666);
        }
        .fm-empty-title { font-size: 14px; font-weight: 600; color: var(--text-secondary, #aaa); }
        .fm-empty-sub { font-size: 12px; color: var(--text-muted, #666); }
        .fm-footer {
          display: flex; align-items: center; justify-content: flex-end; gap: 12px;
          padding: 16px 20px;
          border-top: 1px solid var(--border-secondary, rgba(255,255,255,0.06));
          background: var(--bg-modal, var(--bg-secondary));
          flex-shrink: 0;
        }
        .fm-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          font-size: 13px; font-weight: 600;
          padding: 10px 20px; border-radius: 10px;
          border: none; cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .fm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .fm-btn-cancel {
          background: var(--bg-hover, rgba(255,255,255,0.07));
          color: var(--text-primary, #ddd);
        }
        .fm-btn-cancel:hover:not(:disabled) { 
          background: var(--border-primary, rgba(255,255,255,0.12)); 
        }
        .fm-btn-forward {
          background: var(--accent-primary, #5865f2);
          color: #fff;
          box-shadow: 0 4px 12px rgba(78, 124, 255, 0.2);
        }
        .fm-btn-forward:hover:not(:disabled) { 
          background: var(--accent-primary-hover, #4752c4); 
          box-shadow: 0 6px 16px rgba(78, 124, 255, 0.35);
          transform: translateY(-1px);
        }
        .fm-btn-forward:active:not(:disabled) { 
          transform: translateY(0);
        }
        .fm-spinner {
          width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.15);
          border-top-color: #fff;
          animation: fm-spin 0.7s linear infinite;
        }

        /* ── Send Mode Toggle ── */
        .fm-mode-section {
          padding: 10px 20px;
          background: rgba(78, 124, 255, 0.03);
          border-top: 1px solid var(--border-secondary, rgba(255,255,255,0.05));
          border-bottom: 1px solid var(--border-secondary, rgba(255,255,255,0.05));
          flex-shrink: 0;
          overflow: hidden;
          animation: fm-mode-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes fm-mode-in {
          from { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
          to   { opacity: 1; max-height: 120px; }
        }
        .fm-mode-toggle {
          display: flex;
          background: var(--bg-hover, rgba(0, 0, 0, 0.1));
          border: 1px solid var(--border-primary, rgba(255,255,255,0.08));
          border-radius: 12px;
          padding: 4px;
          gap: 4px;
        }
        .fm-mode-btn {
          flex: 1;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 9px 12px;
          border: none; border-radius: 8px;
          font-size: 12px; font-weight: 600;
          cursor: pointer;
          background: transparent;
          color: var(--text-secondary, #888);
          transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
        }
        .fm-mode-btn:hover:not(.fm-mode-active) {
          color: var(--text-primary, #bbb);
          background: rgba(255,255,255,0.03);
        }
        .fm-mode-active {
          background: var(--accent-primary, #5865f2);
          color: #fff;
          box-shadow: 0 4px 12px rgba(78, 124, 255, 0.25);
        }
        .fm-group-name-wrap {
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
        }
        .fm-group-name-wrap.is-visible {
          max-height: 52px; opacity: 1; margin-top: 10px;
        }
        .fm-group-name-wrap.is-hidden {
          max-height: 0; opacity: 0; margin-top: 0;
        }
        .fm-group-name-input {
          width: 100%; box-sizing: border-box;
          padding: 10px 14px;
          background: var(--bg-input, rgba(255,255,255,0.05));
          border: 1px solid var(--border-primary, rgba(255,255,255,0.08));
          border-radius: 10px;
          font-size: 13px;
          color: var(--text-primary, #ddd);
          outline: none;
          caret-color: var(--accent-primary, #5865f2);
          transition: all 0.2s ease;
        }
        .fm-group-name-input::placeholder { color: var(--text-muted, #555); }
        .fm-group-name-input:focus {
          border-color: var(--accent-primary, #5865f2);
          box-shadow: 0 0 0 3px rgba(78, 124, 255, 0.15);
          background: var(--bg-input);
        }
      `}</style>

      <div
        className="fm-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        onKeyDown={handleKeyDown}
      >
        <div className="fm-modal" role="dialog" aria-modal="true" aria-label="Forward message">

          {/* Header */}
          <div className="fm-header">
            <div>
              <p className="fm-title">
                {isMulti ? `Forward ${messagesToForward.length} messages` : 'Forward message'}
              </p>
              <p className="fm-subtitle">Select conversations to forward to</p>
            </div>
            <button className="fm-close" onClick={onClose} aria-label="Close">
              <X size={15} />
            </button>
          </div>

          {/* Message Preview */}
          <div className="fm-preview">
            <div className="fm-preview-label">
              <Forward size={11} /> Forwarding
            </div>
            {previewData.text && (
              <div className="fm-preview-text">{previewData.text}</div>
            )}
            {previewData.totalAttachments > 0 && (
              <div className="fm-preview-attachments">
                {isMulti ? (
                  <span className="fm-preview-att">
                    <Paperclip size={11} />
                    {previewData.totalAttachments} attachment{previewData.totalAttachments !== 1 ? 's' : ''}
                  </span>
                ) : (
                  (previewData.attachments || []).map((att, i) => (
                    <span key={i} className="fm-preview-att">
                      <AttachmentIcon mimeType={att.mimeType} />
                      {att.originalName || att.fileName}
                    </span>
                  ))
                )}
              </div>
            )}
            {!previewData.text && previewData.totalAttachments === 0 && (
              <div className="fm-preview-text" style={{ opacity: 0.5 }}>Empty message</div>
            )}
          </div>

          {/* Custom Message Input */}
          <div className="fm-custom-message-wrap">
            <textarea
              className="fm-custom-message-input"
              placeholder="Add a message..."
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={2}
              maxLength={1000}
            />
          </div>

          {/* Search */}
          <div className="fm-search-wrap">
            <div className="fm-search-box">
              <Search size={13} style={{ color: 'var(--text-muted, #666)', flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                className="fm-search-input"
                type="text"
                placeholder="Search channels or people..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Selected chips */}
          {selectedIds.size > 0 && (
            <div className="fm-selected-bar">
              <span className="fm-selected-label">{selectedIds.size} selected</span>
              {Array.from(selectedIds).map((id) => {
                let ch = displayResults.find((c) => c._id === id)
                if (!ch) ch = channels.find((c) => c._id === id)
                if (!ch) return null
                return (
                  <span key={id} className="fm-selected-chip">
                    {getChannelLabel(ch)}
                    <button onClick={() => toggleSelection(id)} aria-label="Remove">
                      <X size={11} />
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          {/* ── Send Mode Toggle (Instagram-style) ── */}
          {showModeToggle && (
            <div className="fm-mode-section">
              <div className="fm-mode-toggle">
                <button
                  className={`fm-mode-btn${sendMode === 'separate' ? ' fm-mode-active' : ''}`}
                  onClick={() => setSendMode('separate')}
                  type="button"
                >
                  <Send size={13} />
                  Send Separately
                </button>
                <button
                  className={`fm-mode-btn${sendMode === 'group' ? ' fm-mode-active' : ''}`}
                  onClick={() => setSendMode('group')}
                  type="button"
                >
                  <Users size={13} />
                  Create a Group
                </button>
              </div>
              {/* Group name input — slides in when group mode is active */}
              <div className={`fm-group-name-wrap ${sendMode === 'group' ? 'is-visible' : 'is-hidden'}`}>
                <input
                  ref={groupNameRef}
                  className="fm-group-name-input"
                  type="text"
                  placeholder="Group name (optional)"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={80}
                />
              </div>
            </div>
          )}

          {/* Channel list */}
          <div className="fm-list">
            {isLoadingResults ? (
              <div className="fm-empty">
                <div className="fm-spinner" style={{ width: 20, height: 20, borderTopColor: 'var(--accent-primary)' }} />
                <p className="fm-empty-title" style={{ marginTop: 8 }}>Searching...</p>
              </div>
            ) : filteredChannels.length === 0 ? (
              <div className="fm-empty">
                <p className="fm-empty-title">
                  {searchQuery ? 'No results found' : 'No conversations available'}
                </p>
                {searchQuery && <p className="fm-empty-sub">Try a different search term</p>}
              </div>
            ) : (
              filteredChannels.map((c) => {
                const isSelected = selectedIds.has(c._id)
                return (
                  <button
                    key={c._id}
                    className="fm-channel-btn"
                    onClick={() => toggleSelection(c._id)}
                  >
                    {c.type === 'dm' ? (
                      <Avatar member={c} size={36} showStatus={true} />
                    ) : (
                      <div className="fm-channel-icon">
                        {getChannelIcon(c)}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="fm-channel-name">{getChannelLabel(c)}</div>
                      <div className="fm-channel-type">
                        {c.type === 'dm' ? 'Direct message' : c.type === 'private' ? 'Private channel' : c.type}
                      </div>
                    </div>
                    <div className={`fm-checkbox${isSelected ? ' is-checked' : ''}`}>
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="fm-footer">
            <button
              className="fm-btn fm-btn-cancel"
              onClick={onClose}
              disabled={isForwarding}
            >
              Cancel
            </button>
            <button
              className="fm-btn fm-btn-forward"
              onClick={handleForward}
              disabled={selectedIds.size === 0 || isForwarding}
            >
              {isForwarding ? (
                <>
                  <div className="fm-spinner" />
                  Forwarding...
                </>
              ) : (
                <>
                  {sendMode === 'group' && showModeToggle ? <Users size={14} /> : <Forward size={14} />}
                  {forwardButtonLabel}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

/** Small helper to pick the right icon for an attachment MIME type */
function AttachmentIcon({ mimeType }) {
  if (!mimeType) return <Paperclip size={11} />
  if (mimeType.startsWith('image/')) return <Image size={11} />
  if (mimeType.startsWith('video/')) return <Film size={11} />
  if (mimeType.startsWith('audio/')) return <Music size={11} />
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('7z'))
    return <Archive size={11} />
  return <FileText size={11} />
}
