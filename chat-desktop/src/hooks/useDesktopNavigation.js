import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { desktopLoginTarget } from '../utils/desktopNavigation';

export function useDesktopNavigation(initialized) {
  const navigate = useNavigate();
  useEffect(() => {
    const bridge = window.electronAPI?.windowsNavigation;
    if (!initialized || !bridge) return;
    const drain = () => {
      // Let an in-flight SSO handoff finish before consuming a newer link.
      // loginFlowTask shares its pending promise; two different workspace
      // handoffs must never accidentally consume the same signed response.
      if (useAuthStore.getState().isLoading) return;
      return bridge.takePending().then(route => {
        const target = desktopLoginTarget(route, Boolean(useAuthStore.getState().user));
        if (target) navigate(target);
      }).catch(() => {});
    };
    const unsubscribe = bridge.onPending(drain);
    const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
      if (!state.isLoading && previous.isLoading) drain();
    });
    drain();
    return () => { unsubscribe(); unsubscribeAuth(); };
  }, [initialized, navigate]);
}
