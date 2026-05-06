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
 *
 * @param {string} conversationId - channelId
 * @param {string|null} threadId - optional thread ID
 * @param {React.RefObject} editorRef - ref to the editor instance
 */
export default function useDraftAutoSave(conversationId, threadId, editorRef) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { setDraft, getDraft, clearDraft } = useDraftStore()

  const draftTimerRef = useRef(null)
  const lastConversationRef = useRef(conversationId)
  const lastThreadRef = useRef(threadId)
  const lastSignatureRef = useRef('')
  const restoreGenRef = useRef(0)

  const buildSignature = useCallback((html, text, mentions = []) => {
    return JSON.stringify({
      html: (html || '').trim(),
      text: (text || '').trim(),
      mentions: Array.isArray(mentions) ? mentions : [],
    })
  }, [])

  const saveDraftLocal = useCallback(
    (targetConversationId = conversationId, targetThreadId = threadId) => {
      const ed = editorRef?.current
      if (!ed || !activeWorkspaceId || !targetConversationId) return false

      const { html, text, mentions } = ed.getContent()
      const trimmed = (text || '').trim()
      const trimmedHtml = (html || '').trim()

      if (isContentEmpty(trimmedHtml, trimmed)) {
        clearDraft(targetConversationId, activeWorkspaceId, targetThreadId)
        if (targetConversationId === conversationId && targetThreadId === threadId) {
          lastSignatureRef.current = ''
        }
        return false
      }

      const nextSignature = buildSignature(trimmedHtml, trimmed, mentions)
      if (
        targetConversationId === conversationId &&
        targetThreadId === threadId &&
        nextSignature === lastSignatureRef.current
      ) {
        return false
      }

      setDraft(targetConversationId, trimmedHtml, trimmed, activeWorkspaceId, targetThreadId, {
        mentions,
      })
      lastSignatureRef.current = nextSignature
      return true
    },
    [activeWorkspaceId, buildSignature, clearDraft, conversationId, editorRef, setDraft, threadId],
  )

  const saveDraftDebounced = useCallback(() => {
    const ed = editorRef?.current
    if (!ed || !activeWorkspaceId || !conversationId) return

    const { html, text, mentions } = ed.getContent()
    const trimmed = (text || '').trim()
    const trimmedHtml = (html || '').trim()

    if (isContentEmpty(trimmedHtml, trimmed)) {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
      clearDraft(conversationId, activeWorkspaceId, threadId)
      lastSignatureRef.current = ''
      return
    }

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)

    draftTimerRef.current = setTimeout(() => {
      const nextSignature = buildSignature(trimmedHtml, trimmed, mentions)
      if (nextSignature === lastSignatureRef.current) return

      setDraft(conversationId, trimmedHtml, trimmed, activeWorkspaceId, threadId, {
        mentions,
      })
      lastSignatureRef.current = nextSignature
    }, 800)
  }, [activeWorkspaceId, buildSignature, clearDraft, conversationId, editorRef, setDraft, threadId])

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

        if (!isContentEmpty(html, text)) {
          setDraft(previousConversationId, html, text, activeWorkspaceId, previousThreadId, {
            mentions,
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
  }, [conversationId, setDraft, clearDraft, activeWorkspaceId, threadId, editorRef, flushTimers])

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
