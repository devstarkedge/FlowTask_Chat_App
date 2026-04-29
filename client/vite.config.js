import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from 'path'

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")

  // ─── Production Build-Time Env Validation ─────────────────────────────────
  // These variables are baked into the JS bundle at build time by Vite.
  // If they are missing here, the deployed frontend will call the wrong URLs.
  // Set them in: Render → Chat Frontend → Environment before deploying.
  if (mode === 'production') {
    const requiredVars = [
      { key: 'VITE_API_BASE_URL', hint: 'https://chat-app-api-cyyl.onrender.com/api/chat' },
      { key: 'VITE_SOCKET_URL',   hint: 'https://chat-app-api-cyyl.onrender.com' },
    ]
    const issues = []
    for (const { key, hint } of requiredVars) {
      if (!env[key] || env[key].startsWith('/')) {
        issues.push(`  ${key} = "${env[key] || ''}"  →  must be a full URL, e.g. ${hint}`)
      }
    }
    if (issues.length > 0) {
      console.error(
        '\n[BUILD ERROR] The following VITE_ environment variables are missing or set to a ' +
        'relative path. In production the browser calls these URLs directly — relative paths ' +
        'resolve to the static frontend domain (not the backend).\n\n' +
        issues.join('\n') +
        '\n\nFix: Render → Chat Frontend (Static Site) → Environment → add the variables above, ' +
        'then trigger a Manual Deploy so Vite re-bakes them into the bundle.\n'
      )
      process.exit(1)
    }
  }

  let validatedBackend = env.VITE_BACKEND_URL
  if (!validatedBackend) {
    console.warn("VITE_BACKEND_URL is missing in environment variables. Falling back to http://localhost:3200");
    validatedBackend = "http://localhost:3200";
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
          changeOrigin: true,
        },
      },
    },

    build: {
      minify: "terser",
      terserOptions: {
        compress: {
          // Keep console.error and console.warn so production issues are
          // visible in the browser DevTools console. Only strip verbose logs.
          pure_funcs: ['console.log', 'console.debug', 'console.info'],
          drop_debugger: true,
        },
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // Prefer explicit heavy-libs chunking for predictability
              if (id.includes('lucide-react')) return 'lucide'
              if (id.includes('@tiptap') || id.includes('tiptap')) return 'tiptap'
              if (id.includes('framer-motion')) return 'framer'
              if (id.includes('react-virtuoso')) return 'virtuoso'
              if (id.includes('socket.io-client')) return 'socketio'

              // Generic per-package chunking: place each node_module package into its own chunk
              const modulesPath = id.split(`node_modules${path.sep}`)[1] || id.split('node_modules/')[1]
              if (modulesPath) {
                const parts = modulesPath.split(/[/\\\\]/)
                let pkg = parts[0]
                if (pkg.startsWith('@') && parts.length > 1) pkg = `${pkg}/${parts[1]}`
                const name = pkg.replace('@', '').replace('/', '-')
                return `vendor-${name}`
              }

              return 'vendor'
            }
          },
        },
      },
    },
  })
}