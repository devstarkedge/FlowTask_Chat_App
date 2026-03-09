import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  
  let validatedBackend = env.VITE_BACKEND_URL
  if (!validatedBackend) {
    console.warn("VITE_BACKEND_URL is missing in environment variables. Falling back to HTTP http://localhost:3000");
    validatedBackend = "http://localhost:3000";
  }

  return defineConfig({
    base: "/",

    plugins: [react(), tailwindcss()],

    server: {
      port: 5174,
      proxy: {
        "/api/chat": {
          target: validatedBackend,
          changeOrigin: true,
        },
        "/socket.io": {
          target: validatedBackend,
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