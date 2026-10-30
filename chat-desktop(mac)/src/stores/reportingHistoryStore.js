import { create } from 'zustand'

// No detailed history or access decisions are persisted to offline storage.
export const useReportingHistoryStore = create(() => ({ revision: 0 }))
export function invalidateReportingHistory() {
  useReportingHistoryStore.setState(state => ({ revision: state.revision + 1 }))
}
