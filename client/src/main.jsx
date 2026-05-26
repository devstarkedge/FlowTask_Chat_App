// Handle Vite dynamic import chunk missing errors 
// (happens when old index.html is cached but new deployment replaces chunks on server)
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault(); // Prevent default error handling
  const retryCount = parseInt(sessionStorage.getItem('vitePreloadRetryCount') || '0', 10);
  
  if (retryCount < 3) {
    sessionStorage.setItem('vitePreloadRetryCount', (retryCount + 1).toString());
    window.location.reload(); // Force a hard reload to get the fresh index.html
  } else {
    // Max retries reached, display persistent error UI
    document.body.innerHTML = '<div style="padding: 20px; font-family: system-ui; text-align: center;"><h1>App failed to load</h1><p>We are having trouble loading the app. Please clear your browser cache and try again.</p></div>';
  }
});

// Reset the retry count on a successful load
sessionStorage.removeItem('vitePreloadRetryCount');
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './stores/themeStore'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{
          style: {
            background: 'var(--surface-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-soft)',
          },
        }} />
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
