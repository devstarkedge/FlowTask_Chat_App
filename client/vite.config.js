import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/api/chat': {
        target: 'http://localhost:3200',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3200',
        ws: true,
      },
    },
  },
})
