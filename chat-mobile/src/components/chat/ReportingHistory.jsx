/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, ChevronDown } from 'lucide-react-native'
import { View, Text, Pressable } from 'react-native'
import { messageAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useReportingHistoryStore } from '../../stores/reportingHistoryStore'

export default function ReportingHistory({ message, present, onInitialWork, colors }) {
  const viewerId = useAuthStore(state => state.user?._id)
  const workspaceId = useWorkspaceStore(state => state.activeWorkspaceId)
  const revision = useReportingHistoryStore(state => state.revision)
  const request = useRef(0)
  const cancelRequests = useCallback(() => { request.current++ }, [])
  const latestSummary = useRef(message.reportingHistory)
  latestSummary.current = message.reportingHistory
  const [access, setAccess] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [history, setHistory] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const valid = access?.revision === revision && access?.viewerId === viewerId && access?.workspaceId === workspaceId && access?.messageId === message._id
  const allowed = valid && access?.canView === true
  const count = allowed ? access.count || 0 : 0

  useEffect(() => {
    let active = true
    request.current++
    setExpanded(false); setHistory([]); setCursor(null); setAccess(null); setError(false)
    const accept = value => {
      if (active && value?.viewerId === viewerId && value?.workspaceId === workspaceId) {
        const latest = latestSummary.current
        const count = value.canView && latest?.viewerId === viewerId && latest?.workspaceId === workspaceId
          ? Math.max(value.count || 0, latest.count || 0) : value.count
        setAccess({ ...value, ...(value.canView ? { count } : {}), revision, messageId: message._id })
      }
    }
    if (viewerId && workspaceId) messageAPI.get(message._id).then(({ data }) => accept(data.data.message.reportingHistory)).catch(() => {})
    return () => { active = false; cancelRequests() }
  }, [message._id, viewerId, workspaceId, revision, cancelRequests])

  useEffect(() => {
    const incoming = message.reportingHistory
    if (incoming?.viewerId === viewerId && incoming?.workspaceId === workspaceId) {
      setAccess(current => {
        if (current?.revision !== revision) return current
        if (!incoming.canView) return { ...current, canView: false, count: undefined }
        return current.canView ? { ...current, count: Math.max(current.count || 0, incoming.count || 0), initialWork: incoming.initialWork || current.initialWork } : current
      })
    }
  }, [message.reportingHistory, viewerId, workspaceId, revision])

  const load = useCallback(async (after = null) => {
    if (!allowed) return
    const token = ++request.current
    setLoading(true); setError(false)
    try {
      const { data } = await messageAPI.reportingActivity(message._id, after ? { cursor: after } : {})
      if (token !== request.current) return
      const result = data.data
      setHistory(previous => {
        const unique = new Map((after ? previous : []).map(row => [row.eventId, row]))
        for (const row of result.items) unique.set(row.eventId, row)
        return [...unique.values()]
      })
      setCursor(result.nextCursor)
    } catch (failure) {
      if (token !== request.current) return
      if ([403, 404].includes(failure.response?.status)) { setAccess(null); setExpanded(false); setHistory([]) }
      else setError(true)
    } finally { if (token === request.current) setLoading(false) }
  }, [allowed, message._id])
  useEffect(() => {
    if (expanded && allowed) void load()
    return cancelRequests
  }, [expanded, allowed, count, revision, load, cancelRequests])

  useEffect(() => {
    onInitialWork?.(allowed && access.initialWork ? { ...access.initialWork, revision, viewerId, workspaceId } : null)
  }, [allowed, access?.initialWork, revision, viewerId, workspaceId, onInitialWork])

  if (!allowed) return null
  const text = { color: colors.textPrimary, fontSize: 12 }
  const button = { paddingVertical: 5, paddingHorizontal: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 5, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5 }
  return <View style={{ marginTop: 7 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={(expanded ? 'Hide' : 'View') + ' ' + count + ' activities'} style={button} onPress={() => setExpanded(value => !value)}>
      <Eye size={14} color={colors.textSecondary}/><Text style={text}>{count}</Text><ChevronDown size={12} color={colors.textSecondary} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}/>
    </Pressable>
    {expanded && <View accessibilityLabel="Work activity history" style={{ borderTopWidth: 1, borderColor: colors.border, marginTop: 8, paddingTop: 8 }}>
      {history.map(event => { const report = present(event); return <View key={event.eventId} style={{ borderLeftWidth: 2, borderColor: colors.border, paddingLeft: 10, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Text style={{ ...text, color: colors.textSecondary }}>{report.time}</Text><Text style={{ ...text, fontWeight: '600' }}>{report.title}</Text></View>
        {report.details.map((detail, index) => <Text style={{ ...text, marginTop: 3 }} key={index}>{detail.label ? detail.label + ': ' : ''}{detail.value}</Text>)}
      </View> })}
      {loading && <Text accessibilityLiveRegion="polite" style={text}>Loading activity…</Text>}
      {error && <Pressable accessibilityRole="button" onPress={() => load()}><Text style={text}>Could not load activity. Try again</Text></Pressable>}
      {!loading && !error && history.length === 0 && <Text style={text}>No activity yet.</Text>}
      {cursor && !loading && <Pressable accessibilityRole="button" onPress={() => load(cursor)}><Text style={{ ...text, color: colors.primary }}>Show more</Text></Pressable>}
    </View>}
  </View>
}
