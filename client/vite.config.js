import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const backend = env.VITE_BACKEND_URL

  return defineConfig({
    base: "/",

    plugins: [react(), tailwindcss()],

    server: {
      port: 5174,
      proxy: {
        "/api/chat": {
          target: backend,
          changeOrigin: true,
        },
        "/socket.io": {
          target: backend,
          ws: true,
        },
      },
    },

    build: {
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
    },
  })
}