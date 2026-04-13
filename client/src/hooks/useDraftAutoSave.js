import { useRef, useCallback, useEffect } from 'react'
import { useDraftStore } from '../stores/draftStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { draftAPI } from '../services/api'
import { isContentEmpty } from '../utils/draftUtils'

/**
 * useDraftAutoSave — reusable hook for auto-saving drafts.
 *
 * Features:
 *  - 800ms debounce on content change
 *  - Saves on channel switch (flush pending timers)
 *  - Saves on page unload / tab close
 *  - Restores draft on mount with async cancellation for fast switching
 *  - Syncs to server for cross-device
 *  - localStorage backup via draftStore persist
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
  const serverSyncTimerRef = useRef(null)
  const lastConversationRef = useRef(conversationId)
  const lastContentRef = useRef('')
  // Incrementing counter to detect stale async restores
  const restoreGenRef = useRef(0)

  // ─── Save draft locally + queue server sync ───────────────────────

const saveDraftLocal = useCallback(() => {
  const ed = editorRef?.current
  if (!ed) return false

  //  prevent saving without workspace
  if (!activeWorkspaceId) return false

  if (conversationId !== lastConversationRef.current) return false

  const { html, text } = ed.getContent()
  const trimmed = (text || '').trim()

  // Skip if content hasn't changed
  if (trimmed === lastContentRef.current) return false
  lastContentRef.current = trimmed

  if (!isContentEmpty(html, text)) {
    setDraft(conversationId, html, text, activeWorkspaceId, threadId)
    return true
  } else {
    clearDraft(conversationId, activeWorkspaceId, threadId)
    return false
  }
}, [
  conversationId,
  threadId,
  activeWorkspaceId,
  setDraft,
  clearDraft,
  editorRef,
])


  const syncToServer = useCallback(async () => {
  const ed = editorRef?.current
  if (!ed || !conversationId || !activeWorkspaceId) return
  if (conversationId !== lastConversationRef.current) return

  const { html, text, mentions } = ed.getContent()
  const trimmed = (text || '').trim()
  const trimmedHtml = (html || '').trim()

  try {
    //  HANDLE EMPTY FIRST (CRITICAL)
    if (isContentEmpty(trimmedHtml, trimmed)) {
      let draft = getDraft(conversationId, activeWorkspaceId, threadId)

      //  If we have serverId → delete directly
      if (draft?.serverId) {
        await draftAPI.delete(draft.serverId)
      } else {
        //  Fallback: fetch from server and delete
        try {
          const { data } = await draftAPI.get(conversationId, threadId)
          const serverDraft = data?.data?.draft
          if (serverDraft?._id) {
            await draftAPI.delete(serverDraft._id)
          }
        } catch {
          // ignore errors (e.g. draft not found) - we still want to clear local
        }
      }

      //  Remove from local + sidebar immediately
      useDraftStore.getState().removeServerDraft(
        conversationId,
        threadId,
        activeWorkspaceId
      )

      useDraftStore.getState().markDraftListStale()

      return //  STOP — DO NOT SAVE AFTER DELETE
    }

    //  NORMAL SAVE FLOW
    const resp = await draftAPI.save({
      channelId: conversationId,
      threadId: threadId || null,
      content: trimmed,
      htmlContent: trimmedHtml,
      mentions: mentions || [],
    })

    const savedDraft = resp?.data?.data?.draft
    if (savedDraft) {
      useDraftStore.getState().setServerDraft(savedDraft)
    }

    useDraftStore.getState().markDraftListStale()
  } catch {
    // best-effort (local still works)
  }
}, [
  conversationId,
  threadId,
  activeWorkspaceId,
  editorRef,
  getDraft,
])

  // ─── Debounced save on content change ─────────────────────────────

const saveDraftDebounced = useCallback(() => {
  const ed = editorRef?.current
  if (!ed) return

  const { html, text } = ed.getContent()
  const isEmpty = isContentEmpty(html, text)

  // 🔥 EMPTY → DELETE IMMEDIATELY (NO DEBOUNCE)
  if (isEmpty) {
    clearTimeout(draftTimerRef.current)
    clearTimeout(serverSyncTimerRef.current)

    // ✅ get draft BEFORE clearing
    const draft = getDraft(conversationId, activeWorkspaceId, threadId)

    // ✅ delete from server (with fallback)
    if (draft?.serverId) {
      draftAPI.delete(draft.serverId).catch(() => {})
    } else {
      // 🔥 fallback (VERY IMPORTANT)
      draftAPI.get(conversationId, threadId)
        .then((res) => {
          const serverDraft = res?.data?.data?.draft
          if (serverDraft?._id) {
            return draftAPI.delete(serverDraft._id)
          }
        })
        .catch(() => {})
    }

    // ✅ clear local AFTER delete
    clearDraft(conversationId, activeWorkspaceId, threadId)

    // ✅ update UI instantly
    useDraftStore.getState().removeServerDraft(
      conversationId,
      threadId,
      activeWorkspaceId
    )

    useDraftStore.getState().markDraftListStale()

    return
  }

  // 🧠 NORMAL TYPING FLOW (DEBOUNCED SAVE)
  if (draftTimerRef.current) clearTimeout(draftTimerRef.current)

  draftTimerRef.current = setTimeout(() => {
    const didSave = saveDraftLocal()

    if (didSave) {
      if (serverSyncTimerRef.current) {
        clearTimeout(serverSyncTimerRef.current)
      }

      serverSyncTimerRef.current = setTimeout(syncToServer, 1000)
    }
  }, 800)
}, [
  conversationId,
  threadId,
  activeWorkspaceId,
  saveDraftLocal,
  syncToServer,
  getDraft,
  clearDraft,
  editorRef,
])
  // ─── Flush all pending timers (call before channel switch) ────────

  const flushTimers = useCallback(() => {
    if (draftTimerRef.current) { clearTimeout(draftTimerRef.current); draftTimerRef.current = null }
    if (serverSyncTimerRef.current) { clearTimeout(serverSyncTimerRef.current); serverSyncTimerRef.current = null }
  }, [])

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
  // Uses a generation counter to cancel stale async restores on fast channel switching.

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

  let draft = null
  let attempts = 0

  while (attempts < 3 && !draft) {
    // 🔹 1. Try local first
    draft = getDraft(conversationId, activeWorkspaceId, threadId)

    // 🔹 2. Try server if not found
    if (!draft && activeWorkspaceId) {
      try {
        const { data } = await draftAPI.get(conversationId, threadId)

        // If channel changed during API call → cancel
        if (gen !== restoreGenRef.current) return false

        if (data?.data?.draft) {
          const serverDraft = data.data.draft

          draft = {
            html: serverDraft.htmlContent || '',
            text: serverDraft.content || '',
            serverId: serverDraft._id,
          }

          // Cache locally (VERY IMPORTANT)
          useDraftStore.getState().setServerDraft(serverDraft)
        }
      } catch {
        // ignore errors
      }
    }

    //  If still no draft - wait & retry
    if (!draft) {
      await new Promise((res) => setTimeout(res, 120))
    }

    attempts++
  }

  // Final safety check
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
}, [conversationId, threadId, activeWorkspaceId, getDraft, editorRef]) // ─── Save on page unload / tab close ──────────────────────────────

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
