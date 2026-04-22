import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useChannelStore } from '../../stores/channelStore'
import { scheduledMessageAPI } from '../../services/api'
import { getChannelPath, getDMPath } from '../../utils/chatRoutes'
import {
  Clock, Trash2, Send, Edit3, Loader2, Search, Calendar, AlertCircle, Paperclip,
} from 'lucide-react'
import toast from 'react-hot-toast'

function formatScheduledTime(date) {
  const d = new Date(date)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow = d.toDateString() === tomorrow.toDateString()

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Today at ${time}`
  if (isTomorrow) return `Tomorrow at ${time}`
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`
}

function truncatePreview(text, max = 80) {
  if (!text) return ''
  const stripped = text.replace(/<[^>]*>/g, '').trim()
  return stripped.length > max ? stripped.slice(0, max) + '…' : stripped
}

export default function ScheduledMessagesList({ onCountChange } = {}) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const channels = useChannelStore((s) => s.channels)
  const navigate = useNavigate()

  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [rescheduleId, setRescheduleId] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [actionLoading, setActionLoading] = useState(null)

  const fetchMessages = useCallback(async () => {
    if (!activeWorkspaceId) return
    try {
      setLoading(true)
      const { data } = await scheduledMessageAPI.list()
      const items = data?.data?.scheduledMessages || data?.data || []
      const arr = Array.isArray(items) ? items : []
      setMessages(arr)
      onCountChange?.(arr.length)
    } catch {
      // Silent fail
    } finally {
      setLoading(false)
    }
  }, [activeWorkspaceId])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  const handleCancel = async (e, id) => {
    e.stopPropagation()
    setActionLoading(id)
    try {
      await scheduledMessageAPI.cancel(id)
      setMessages((prev) => prev.filter((m) => m._id !== id))
      toast.success('Scheduled message cancelled')
    } catch {
      toast.error('Failed to cancel')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSendNow = async (e, id) => {
    e.stopPropagation()
    setActionLoading(id)
    try {
      await scheduledMessageAPI.sendNow(id)
      setMessages((prev) => prev.filter((m) => m._id !== id))
      toast.success('Message sent')
    } catch {
      toast.error('Failed to send')
    } finally {
      setActionLoading(null)
    }
  }

  const openReschedule = (e, msg) => {
    e.stopPropagation()
    setRescheduleId(msg._id)
    const current = new Date(msg.scheduledAt)
    // Pre-fill with current scheduled time
    setRescheduleDate(current.toISOString().slice(0, 16))
  }

  const handleReschedule = async (e) => {
    e.stopPropagation()
    if (!rescheduleDate) {
      toast.error('Pick a date and time')
      return
    }
    const date = new Date(rescheduleDate)
    if (date <= new Date()) {
      toast.error('Must be in the future')
      return
    }
    setActionLoading(rescheduleId)
    try {
      await scheduledMessageAPI.reschedule(rescheduleId, date.toISOString())
      setMessages((prev) =>
        prev.map((m) =>
          m._id === rescheduleId ? { ...m, scheduledAt: date.toISOString() } : m,
        ),
      )
      setRescheduleId(null)
      toast.success('Rescheduled')
    } catch {
      toast.error('Failed to reschedule')
    } finally {
      setActionLoading(null)
    }
  }

  const handleNavigate = (msg) => {
    const channelId = typeof msg.channelId === 'object' ? msg.channelId._id : msg.channelId
    const channel = channels.find((c) => c._id === channelId)
    if (!channel) return
    if (channel.type === 'dm') {
      navigate(getDMPath(activeWorkspaceId, channelId))
    } else {
      navigate(getChannelPath(activeWorkspaceId, channelId))
    }
  }

  const getChannelName = (channelId) => {
    const id = typeof channelId === 'object' ? channelId._id : channelId
    const ch = channels.find((c) => c._id === id)
    if (!ch) return 'Unknown'
    if (ch.type === 'dm') return ch.dmRecipientName || 'Direct Message'
    return `#${ch.name}`
  }

  const filtered = searchQuery
    ? messages.filter((m) => {
        const content = (m.content || '').toLowerCase()
        const channelId = typeof m.channelId === 'object' ? m.channelId._id : m.channelId
        const name = getChannelName(channelId).toLowerCase()
        const q = searchQuery.toLowerCase()
        return content.includes(q) || name.includes(q)
      })
    : messages

  const minDateTime = new Date().toISOString().slice(0, 16)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    )
  }
  return (
    <div className="panel">
      {/* Header */}
      <div className="panel-header">
        <h2 className="font-semibold text-sm mb-0" style={{ color: 'var(--text-primary)' }}>
          <Clock size={15} className="inline mr-1.5" style={{ verticalAlign: '-2px' }} />
          Scheduled
          {messages.length > 0 && (
            <span
              className="ml-2 px-1.5 py-0.5 text-xs rounded-full font-medium"
              style={{ background: 'var(--accent-primary)', color: 'white' }}
            >
              {messages.length}
            </span>
          )}
        </h2>

        {/* Search */}
        <div className="panel-search" style={{ flex: 1 }}>
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scheduled..."
            className="panel-search-input"
          />
        </div>
      </div>

      {/* Scheduled List */}
      <div className="panel-body">
        {filtered.length === 0 ? (
          <div className="panel-empty">
            <Calendar size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No scheduled messages</p>
            <p className="text-xs mt-1">Use the clock button in chat to schedule messages</p>
          </div>
        ) : (
          <div className="panel-list">
            {filtered.map((msg) => {
              const channelId = typeof msg.channelId === 'object' ? msg.channelId._id : msg.channelId
              const isPast = new Date(msg.scheduledAt) < new Date()
              return (
                <div
                  key={msg._id}
                  onClick={() => handleNavigate(msg)}
                  className="panel-item cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                      {getChannelName(channelId)}
                    </span>
                    <div className="flex items-center gap-1">
                      {isPast && (
                        <AlertCircle size={11} style={{ color: 'var(--accent-yellow)' }} title="Overdue" />
                      )}
                      {msg.attachments?.length > 0 && (
                        <Paperclip size={11} style={{ color: 'var(--text-muted)' }} title="Has attachments" />
                      )}
                      <Clock size={11} style={{ color: 'var(--accent-primary)' }} />
                      <span className="text-[10px]" style={{ color: isPast ? 'var(--accent-yellow)' : 'var(--text-muted)' }}>
                        {formatScheduledTime(msg.scheduledAt)}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs truncate mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    {truncatePreview(msg.content || msg.htmlContent)}
                  </p>

                  {/* Reschedule inline form */}
                  {rescheduleId === msg._id && (
                    <div
                      className="flex items-center gap-1.5 mb-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="datetime-local"
                        value={rescheduleDate}
                        min={minDateTime}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                        className="panel-search-input"
                        style={{ paddingLeft: 10 }}
                      />
                      <button
                        onClick={handleReschedule}
                        disabled={actionLoading === msg._id}
                        className="text-xs px-2 py-1 rounded font-medium"
                        style={{ background: 'var(--accent-primary)', color: 'white', border: 'none' }}
                      >
                        Save
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setRescheduleId(null) }}
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: 'var(--bg-active)', color: 'var(--text-muted)', border: 'none' }}
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Actions (visible on hover) */}
                  <div className="panel-item-actions items-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSendNow(e, msg._id) }}
                      disabled={actionLoading === msg._id}
                      className="p-1 rounded transition-colors text-xs flex items-center gap-1"
                      style={{ color: 'var(--accent-green, #22c55e)', background: 'transparent', border: 'none' }}
                      title="Send now"
                    >
                      <Send size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openReschedule(e, msg) }}
                      disabled={actionLoading === msg._id}
                      className="p-1 rounded transition-colors text-xs flex items-center gap-1"
                      style={{ color: 'var(--accent-primary)', background: 'transparent', border: 'none' }}
                      title="Reschedule"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCancel(e, msg._id) }}
                      disabled={actionLoading === msg._id}
                      className="p-1 rounded transition-colors"
                      style={{ color: 'var(--accent-red)', background: 'transparent', border: 'none' }}
                      title="Cancel"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
