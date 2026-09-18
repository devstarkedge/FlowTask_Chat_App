import { useRef, useCallback, useEffect } from 'react'
import { useDraftStore, getDraftKey } from '../stores/draftStore'
import useDraftDiscard from './useDraftDiscard'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { isContentEmpty } from '../utils/draftUtils'

/**
 * useDraftAutoSave — reusable hook for auto-saving drafts.
 *
 * Features:
 *  - 800ms debounce on content change
 *  - Saves on channel switch (flush pending timers)
 *  - Saves on page unload / tab close
 *  - Restores draft on mount from local storage (draftStore)
 *  - isContentEmpty guard to prevent phantom <p></p> drafts
 *
 * @param {string} conversationId - channelId
 * @param {string|null} threadId - optional thread ID
 * @param {React.RefObject} editorRef - ref to the editor instance
 */
export default function useDraftAutoSave(conversationId, threadId, editorRef, pendingFilesRef, onDiscard) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { setDraft, getDraft, clearDraft } = useDraftStore()

  const draftTimerRef = useRef(null)
  const lastConversationRef = useRef(conversationId)
  const lastContentRef = useRef('')
  // Incrementing counter to detect stale async restores
  const restoreGenRef = useRef(0)

  // ─── Save draft locally ───────────────────────────────────────────

  const saveDraftLocal = useCallback(() => {
    const ed = editorRef?.current
    if (!ed) return false
    if (conversationId !== lastConversationRef.current) return false
    const { html, text, mentions } = ed.getContent()
    const trimmed = (text || '').trim()
    const attachments = (pendingFilesRef?.current || []).map((file) => ({
      fileId: file._id || file.fileId,
      fileName: file.fileName || file.name || '',
      mimeType: file.mimeType || file.type || '',
      fileSize: file.fileSize ?? file.size ?? 0,
      url: file.url || file.secureUrl || '',
      thumbnailUrl: file.thumbnailUrl || null,
    }))

    if (isContentEmpty(html, text) && attachments.length === 0) {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
      restoreGenRef.current++
      lastContentRef.current = ''
      clearDraft(conversationId, activeWorkspaceId, threadId, { preventRestore: true })
      return false
    }

    // Skip if content hasn't changed
    if (trimmed === lastContentRef.current && attachments.length === 0) return false
    lastContentRef.current = trimmed

    if (!isContentEmpty(html, text) || attachments.length > 0) {
      setDraft(conversationId, html, text, activeWorkspaceId, threadId, { mentions, attachments })
      return true
    } else {
      clearDraft(conversationId, activeWorkspaceId, threadId)
      return false
    }
  }, [conversationId, threadId, activeWorkspaceId, setDraft, clearDraft, editorRef, pendingFilesRef])

  // ─── Debounced save on content change ─────────────────────────────

  const saveDraftDebounced = useCallback(() => {
    const ed = editorRef?.current
    if (!ed || !conversationId || !activeWorkspaceId) return
    const { html, text } = ed.getContent()
    if (isContentEmpty(html, text) && (pendingFilesRef?.current || []).length === 0) {
      saveDraftLocal()
      return
    }
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      saveDraftLocal()
    }, 800)
  }, [saveDraftLocal, editorRef, conversationId, activeWorkspaceId, pendingFilesRef])

  // ─── Flush all pending timers (call before channel switch) ────────

  const flushTimers = useCallback(() => {
    if (draftTimerRef.current) { clearTimeout(draftTimerRef.current); draftTimerRef.current = null }
  }, [])

  useDraftDiscard(getDraftKey(conversationId, activeWorkspaceId, threadId), () => {
    flushTimers()
    restoreGenRef.current++
    lastContentRef.current = ''
    if (pendingFilesRef) pendingFilesRef.current = []
    onDiscard?.()
    editorRef?.current?.clear()
  })

  // ─── Save on conversation switch ──────────────────────────────────

  useEffect(() => {
    if (lastConversationRef.current && lastConversationRef.current !== conversationId) {
      // Flush any pending debounced saves for the old channel
      flushTimers()

      // Save draft for the channel we're leaving
      const ed = editorRef?.current
      if (ed) {
        const { html, text } = ed.getContent()
        if (!isContentEmpty(html, text)) {
          setDraft(lastConversationRef.current, html, text, activeWorkspaceId, threadId)
        } else {
          clearDraft(lastConversationRef.current, activeWorkspaceId, threadId)
        }

        // Clear editor immediately to prevent stale content leaking to the new channel
        ed.clear()
      }
    }
    lastConversationRef.current = conversationId
    lastContentRef.current = ''
  }, [conversationId, setDraft, clearDraft, activeWorkspaceId, threadId, editorRef, flushTimers])

  // ─── Restore draft on mount / conversation change ─────────────────

  const restoreDraft = useCallback(async () => {
    const gen = ++restoreGenRef.current
    const ed = editorRef?.current
    if (!ed || !conversationId) return false

    // Clear editor immediately so stale content never leaks
    ed.clear()
    lastContentRef.current = ''

    // Ensure Zustand persist hydration
    if (!useDraftStore.persist.hasHydrated()) {
      await new Promise((resolve) => {
        const unsub = useDraftStore.persist.onFinishHydration(() => {
          unsub()
          resolve()
        })
      })
      if (gen !== restoreGenRef.current) return false
    }

    if (gen !== restoreGenRef.current || useDraftStore.getState().discardedDrafts[getDraftKey(conversationId, activeWorkspaceId, threadId)]) return false

    const draft = getDraft(conversationId, activeWorkspaceId, threadId)

    if (gen !== restoreGenRef.current) return false

    if (draft?.html && !isContentEmpty(draft.html, draft.text)) {
      ed.setContent(draft.html)
      lastContentRef.current = (draft.text || '').trim()
      return true
    } else {
      ed.clear()
      lastContentRef.current = ''
      return false
    }
  }, [conversationId, threadId, activeWorkspaceId, getDraft, editorRef])

  // ─── Save on page unload / tab close ──────────────────────────────

  useEffect(() => {
    const handleBeforeUnload = () => {
      saveDraftLocal()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveDraftLocal()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      // Execute pending save before unmount, then cancel remaining timers
      saveDraftLocal()
      flushTimers()
    }
  }, [saveDraftLocal, flushTimers])

  return {
    saveDraftDebounced,
    restoreDraft,
    saveDraftLocal,
  }
}
