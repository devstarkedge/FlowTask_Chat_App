// Handle Vite dynamic import chunk missing errors in PRODUCTION only.
// In development this can cause unwanted automatic reloads during HMR,
// so avoid forcing a hard reload when running locally.
if (import.meta.env.PROD) {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault(); // Prevent default error handling
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.warn('[REFRESH] vite:preloadError caught while offline — suppressing automatic reload');
      return;
    }
    const retryCount = parseInt(sessionStorage.getItem('vitePreloadRetryCount') || '0', 10);

    if (retryCount < 2) {
      sessionStorage.setItem('vitePreloadRetryCount', (retryCount + 1).toString());
      console.warn(`[REFRESH] window.location.reload triggered by: vite:preloadError (attempt ${retryCount + 1})`);
      window.location.reload();
    } else {
      console.error('[REFRESH] Max vite:preloadError reload attempts reached. Stopping auto-reload.');
    }
  });
}

// Reset the retry count on a successful load
sessionStorage.removeItem('vitePreloadRetryCount');

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import { queryClient } from './queries/queryClient'
import { isDesktopApp } from './services/desktopService'
import { notificationService, navigationRouter } from './notifications'
import './stores/themeStore'
import 'prosemirror-view/style/prosemirror.css'
import './index.css'

const AppRouter = isDesktopApp() ? HashRouter : BrowserRouter;

if (isDesktopApp()) {
  document.body.classList.add('is-electron');
  if (window.electronAPI?.hasNativeWindowControls) {
    document.body.classList.add('has-native-window-controls');
  }
}

// Initialize notification service navigation click routing
notificationService.setupNavigation();

// Listen for custom web notification click events
if (typeof window !== 'undefined') {
  window.addEventListener('notification:click', (event) => {
    if (event.detail) {
      navigationRouter.navigate(event.detail);
    }
  });
}

// Initialize conversation presence tracking for unread count management
import { conversationPresence } from './services/conversationPresence'
conversationPresence.setup()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRouter>
        <Toaster position="top-right" toastOptions={{
          style: {
            background: 'var(--surface-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-soft)',
          },
        }} />
        <App />
      </AppRouter>
    </QueryClientProvider>
  </StrictMode>,
)
