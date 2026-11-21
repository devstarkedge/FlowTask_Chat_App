import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from 'node:module';
import { taskChatDevServer } from "./scripts/dev-server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { navigationOrigin } = createRequire(import.meta.url)('./electron/app-navigation.cjs');

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const flowTaskUrl = env.VITE_FLOWTASK_URL || '';
  if (mode === 'production' && !flowTaskUrl) throw new Error('Set VITE_FLOWTASK_URL in chat-desktop/.env or the build environment before building.');
  const peerOrigin = navigationOrigin(flowTaskUrl || 'http://localhost:5173', mode === 'production');
  const flowTaskAliases = (env.VITE_FLOWTASK_URL_ALIASES || '').split(',').map(value => value.trim()).filter(Boolean)
    .map(value => navigationOrigin(value, mode === 'production'));
  const peerOrigins = [...new Set([peerOrigin, ...flowTaskAliases])];

  // ─── Production Build-Time Env Validation ─────────────────────────────────
  // These variables are baked into the JS bundle at build time by Vite.
  // If they are missing here, the deployed frontend will call the wrong URLs.
  // Set them in: Render → Chat Frontend → Environment before deploying.
  if (mode === "production") {
    const requiredVars = [
      {
        key: "VITE_API_BASE_URL",
        hint: "https://chat-app-api-cyyl.onrender.com/api/chat",
      },
      {
        key: "VITE_SOCKET_URL",
        hint: "https://chat-app-api-cyyl.onrender.com",
      },
    ];
    const issues = [];
    for (const { key, hint } of requiredVars) {
      if (!env[key] || env[key].startsWith("/")) {
        issues.push(
          `  ${key} = "${env[key] || ""}"  →  must be a full URL, e.g. ${hint}`,
        );
      }
    }
    if (issues.length > 0) {
      console.error(
        "\n[BUILD ERROR] The following VITE_ environment variables are missing or set to a " +
          "relative path. In production the browser calls these URLs directly — relative paths " +
          "resolve to the static frontend domain (not the backend).\n\n" +
          issues.join("\n") +
          "\n\nFix: Render → Chat Frontend (Static Site) → Environment → add the variables above, " +
          "then trigger a Manual Deploy so Vite re-bakes them into the bundle.\n",
      );
      process.exit(1);
    }
  }

  let validatedBackend = env.VITE_BACKEND_URL;
  if (!validatedBackend) {
    console.warn(
      "VITE_BACKEND_URL is missing in environment variables. Falling back to http://localhost:3200",
    );
    validatedBackend = "http://localhost:3200";
  }

  return defineConfig({
    define: { 'import.meta.env.VITE_FLOWTASK_URL': JSON.stringify(peerOrigin) },
    base: mode === "production" ? "./" : "/",

    plugins: [
      taskChatDevServer(__dirname),
      react(),
      tailwindcss(),
      {
        name: 'desktop-navigation-config',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'desktop-navigation.json',
            source: JSON.stringify({ peerOrigin, peerOrigins }) });
        },
      },
      {
        name: 'html-csp-transform',
        transformIndexHtml(html) {
          // NOTE: Electron apps load via file:// protocol.
          // strict 'self' CSP blocks ES module scripts on file:// → blank screen.
          // CSP is handled by Electron's session.setPermissionRequestHandler
          // and webSecurity settings in main.cjs instead.
          return html;
        }
      }
    ],

    resolve: {
      alias: {
        yjs: path.resolve(__dirname, "node_modules/yjs"),
        "y-prosemirror": path.resolve(__dirname, "node_modules/y-prosemirror"),
        "y-protocols/awareness": path.resolve(
          __dirname,
          "node_modules/y-protocols/awareness.js",
        ),
        "y-protocols/sync": path.resolve(
          __dirname,
          "node_modules/y-protocols/sync.js",
        ),
        "@tiptap/y-tiptap": path.resolve(
          __dirname,
          "node_modules/@tiptap/y-tiptap",
        ),
      },
    },

    optimizeDeps: {
      include: [
        "yjs",
        "y-prosemirror",
        "y-protocols/awareness",
        "y-protocols/sync",
        "@tiptap/y-tiptap",
        "lib0/observable",
        "lib0/binary",
      ],
    },

    server: {
      fs: { allow: [searchForWorkspaceRoot(__dirname), path.resolve(__dirname, '../shared')] },
      port: 5174,
      strictPort: true,
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
      minify: "oxc",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              // Prefer explicit heavy-libs chunking for predictability
              if (id.includes("lucide-react")) return "lucide";
              if (id.includes("@tiptap") || id.includes("tiptap"))
                return "tiptap";
              if (id.includes("framer-motion")) return "framer";
              if (id.includes("react-virtuoso")) return "virtuoso";
              if (id.includes("socket.io-client")) return "socketio";

              // Generic per-package chunking: place each node_module package into its own chunk
              const modulesPath =
                id.split(`node_modules${path.sep}`)[1] ||
                id.split("node_modules/")[1];
              if (modulesPath) {
                const parts = modulesPath.split(/[/\\\\]/);
                let pkg = parts[0];
                if (pkg.startsWith("@") && parts.length > 1)
                  pkg = `${pkg}/${parts[1]}`;
                const name = pkg.replace("@", "").replace("/", "-");
                return `vendor-${name}`;
              }

              return "vendor";
            }
          },
        },
      },
    },
  });
};
