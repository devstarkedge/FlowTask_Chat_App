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
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{
        style: { background: '#222529', color: '#d1d2d3', border: '1px solid #393b3d' },
      }} />
      <App />
    </BrowserRouter>
  </StrictMode>,
)
