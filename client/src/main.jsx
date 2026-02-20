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
