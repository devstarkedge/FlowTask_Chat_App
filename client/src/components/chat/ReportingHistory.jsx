/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, ChevronDown } from 'lucide-react'
import { messageAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useReportingHistoryStore } from '../../stores/reportingHistoryStore'

export default function ReportingHistory({ message, present }) {
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
        return current.canView ? { ...current, count: Math.max(current.count || 0, incoming.count || 0) } : current
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

  if (!allowed) return null
  const historyId = 'reporting-history-' + message._id
  return (
    <div className="attendance-report__history">
      <button type="button" className="attendance-report__eye" aria-expanded={expanded} aria-controls={historyId}
        aria-label={(expanded ? 'Hide' : 'View') + ' ' + count + ' activities'} onClick={() => setExpanded(value => !value)}>
        <Eye size={14} aria-hidden="true" /><span>{count}</span><ChevronDown size={12} aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
      </button>
      {expanded && <div id={historyId} className="attendance-report__timeline" aria-label="Work activity history" aria-live="polite">
        {history.length > 0 && <ol>{history.map(event => {
          const report = present(event)
          return <li key={event.eventId}>
            <div className="attendance-report__timeline-heading"><span>{report.stamp.split(' · ').at(-1)}</span><strong>{report.title}</strong></div>
            {report.details.map((detail, index) => <div className="attendance-report__timeline-detail" key={index}>{detail.label && <span>{detail.label}: </span>}{detail.value}</div>)}
          </li>
        })}</ol>}
        {loading && <p role="status">Loading activity…</p>}
        {error && <p role="alert">Could not load activity. <button type="button" onClick={() => load()}>Try again</button></p>}
        {!loading && !error && history.length === 0 && <p>No activity yet.</p>}
        {cursor && !loading && <button type="button" className="attendance-report__more" onClick={() => load(cursor)}>Show more</button>}
      </div>}
    </div>
  )
}
