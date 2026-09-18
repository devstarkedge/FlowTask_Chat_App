import { useEffect, useRef } from 'react'
import { useDraftStore } from '../stores/draftStore'

// Subscribe synchronously so pending saves and restores are canceled before
// another timer or editor update can recreate an explicitly deleted draft.
export default function useDraftDiscard(key, onDiscard) {
  const callbackRef = useRef(onDiscard)
  callbackRef.current = onDiscard
  useEffect(() => {
    if (!key) return
    return useDraftStore.subscribe((state, previous) => {
      if (state.discardedDraftKey === key && state.discardRevision !== previous.discardRevision) {
        callbackRef.current()
      }
    })
  }, [key])
}
