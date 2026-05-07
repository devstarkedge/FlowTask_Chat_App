import { useRef, useCallback, useEffect } from 'react'
import { useDraftStore } from '../stores/draftStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { isContentEmpty } from '../utils/draftUtils'

/**
 * useDraftAutoSave — reusable hook for auto-saving drafts.
 *
 * Features:
 *  - 800ms debounce on content change
 *  - Saves on channel switch (flush pending timers)
 *  - Saves on page unload / tab close
 *  - Restores draft on mount with async cancellation for fast switching
 *  - Persists drafts locally via draftStore/localStorage
 *  - isContentEmpty guard to prevent phantom <p></p> drafts
 *  - pendingFilesRef: a React ref pointing to the current upload attachment list
 *    so attachment drafts are persisted alongside text drafts.
 *
 * @param {string} conversationId - channelId
 * @param {string|null} threadId - optional thread ID
 * @param {React.RefObject} editorRef - ref to the editor instance
 * @param {React.RefObject} [pendingFilesRef] - ref to the current pendingFiles state array
 */
export default function useDraftAutoSave(conversationId, threadId, editorRef, pendingFilesRef) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { setDraft, getDraft, clearDraft } = useDraftStore()

  const draftTimerRef = useRef(null)
  const lastConversationRef = useRef(conversationId)
  const lastThreadRef = useRef(threadId)
  const lastSignatureRef = useRef('')
  const restoreGenRef = useRef(0)

  const buildSignature = useCallback((html, text, mentions = [], attachments = []) => {
    return JSON.stringify({
      html: (html || '').trim(),
      text: (text || '').trim(),
      mentions: Array.isArray(mentions) ? mentions : [],
      attachmentCount: Array.isArray(attachments) ? attachments.length : 0,
    })
  }, [])

  /**
   * Map a pendingFile object (from upload response or restored draft) to the
   * attachment shape stored in draftStore.
   */
  const mapToAttachment = useCallback((f) => ({
    fileId: f._id || f.fileId || null,
    fileName: f.fileName || f.name || '',
    mimeType: f.mimeType || f.type || '',
    fileSize: f.fileSize || f.size || 0,
    url: f.url || f.secureUrl || '',
    thumbnailUrl: f.thumbnailUrl || null,
  }), [])

  const saveDraftLocal = useCallback(
    (targetConversationId = conversationId, targetThreadId = threadId) => {
      const ed = editorRef?.current
      if (!ed || !activeWorkspaceId || !targetConversationId) return false

      const { html, text, mentions } = ed.getContent()
      const trimmed = (text || '').trim()
      const trimmedHtml = (html || '').trim()
      const currentFiles = pendingFilesRef?.current || []
      const attachments = currentFiles.map(mapToAttachment)

      if (isContentEmpty(trimmedHtml, trimmed) && attachments.length === 0) {
        clearDraft(targetConversationId, activeWorkspaceId, targetThreadId)
        if (targetConversationId === conversationId && targetThreadId === threadId) {
          lastSignatureRef.current = ''
        }
        return false
      }

      const nextSignature = buildSignature(trimmedHtml, trimmed, mentions, attachments)
      if (
        targetConversationId === conversationId &&
        targetThreadId === threadId &&
        nextSignature === lastSignatureRef.current
      ) {
        return false
      }

      setDraft(targetConversationId, trimmedHtml, trimmed, activeWorkspaceId, targetThreadId, {
        mentions,
        attachments,
      })
      lastSignatureRef.current = nextSignature
      return true
    },
    [activeWorkspaceId, buildSignature, clearDraft, conversationId, editorRef, mapToAttachment, pendingFilesRef, setDraft, threadId],
  )

  const saveDraftDebounced = useCallback(() => {
    const ed = editorRef?.current
    if (!ed || !activeWorkspaceId || !conversationId) return

    const { html, text, mentions } = ed.getContent()
    const trimmed = (text || '').trim()
    const trimmedHtml = (html || '').trim()
    const currentFiles = pendingFilesRef?.current || []
    const attachments = currentFiles.map(mapToAttachment)

    if (isContentEmpty(trimmedHtml, trimmed) && attachments.length === 0) {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
      clearDraft(conversationId, activeWorkspaceId, threadId)
      lastSignatureRef.current = ''
      return
    }

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)

    draftTimerRef.current = setTimeout(() => {
      const nextSignature = buildSignature(trimmedHtml, trimmed, mentions, attachments)
      if (nextSignature === lastSignatureRef.current) return

      setDraft(conversationId, trimmedHtml, trimmed, activeWorkspaceId, threadId, {
        mentions,
        attachments,
      })
      lastSignatureRef.current = nextSignature
    }, 800)
  }, [activeWorkspaceId, buildSignature, clearDraft, conversationId, editorRef, mapToAttachment, pendingFilesRef, setDraft, threadId])

  const cancelPendingDraft = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
  }, [])

  const flushTimers = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (
      lastConversationRef.current &&
      (lastConversationRef.current !== conversationId || lastThreadRef.current !== threadId)
    ) {
      flushTimers()

      const ed = editorRef?.current
      if (ed && activeWorkspaceId) {
        const { html, text, mentions } = ed.getContent()
        const previousConversationId = lastConversationRef.current
        const previousThreadId = lastThreadRef.current
        const currentFiles = pendingFilesRef?.current || []
        const attachments = currentFiles.map(mapToAttachment)

        if (!isContentEmpty(html, text) || attachments.length > 0) {
          setDraft(previousConversationId, html, text, activeWorkspaceId, previousThreadId, {
            mentions,
            attachments,
          })
        } else {
          clearDraft(previousConversationId, activeWorkspaceId, previousThreadId)
        }

        ed.clear()
      }
    }

    lastConversationRef.current = conversationId
    lastThreadRef.current = threadId
    lastSignatureRef.current = ''
  }, [conversationId, setDraft, clearDraft, activeWorkspaceId, threadId, editorRef, flushTimers, mapToAttachment, pendingFilesRef])

  const restoreDraft = useCallback(async () => {
    const gen = ++restoreGenRef.current
    const ed = editorRef?.current
    if (!ed || !conversationId || !activeWorkspaceId) return false

    ed.clear()
    lastSignatureRef.current = ''

    if (!useDraftStore.persist.hasHydrated()) {
      await new Promise((resolve) => {
        const unsub = useDraftStore.persist.onFinishHydration(() => {
          unsub()
          resolve()
        })
      })
      if (gen !== restoreGenRef.current) return false
    }

    const draft = getDraft(conversationId, activeWorkspaceId, threadId)
    if (gen !== restoreGenRef.current) return false

    if (draft?.html && !isContentEmpty(draft.html, draft.text)) {
      ed.setContent(draft.html)
      lastSignatureRef.current = buildSignature(draft.html, draft.text, draft.mentions)
      return true
    }

    ed.clear()
    return false
  }, [activeWorkspaceId, buildSignature, conversationId, editorRef, getDraft, threadId])

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
      saveDraftLocal(lastConversationRef.current, lastThreadRef.current)
      flushTimers()
    }
  }, [saveDraftLocal, flushTimers])

  return {
    saveDraftDebounced,
    restoreDraft,
    saveDraftLocal,
    cancelPendingDraft,
  }
}
