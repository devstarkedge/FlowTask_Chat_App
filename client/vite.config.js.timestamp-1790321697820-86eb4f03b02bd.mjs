// vite.config.js
import { defineConfig, loadEnv } from "file:///D:/Tisha/FlowTask_Chat_App/client/node_modules/vite/dist/node/index.js";
import react from "file:///D:/Tisha/FlowTask_Chat_App/client/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///D:/Tisha/FlowTask_Chat_App/client/node_modules/@tailwindcss/vite/dist/index.mjs";
import path from "path";
import { fileURLToPath } from "url";
var __vite_injected_original_import_meta_url = "file:///D:/Tisha/FlowTask_Chat_App/client/vite.config.js";
var __dirname = path.dirname(fileURLToPath(__vite_injected_original_import_meta_url));
var vite_config_default = ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (mode === "production") {
    const requiredVars = [
      {
        key: "VITE_API_BASE_URL",
        hint: "https://chat-app-api-cyyl.onrender.com/api/chat"
      },
      {
        key: "VITE_SOCKET_URL",
        hint: "https://chat-app-api-cyyl.onrender.com"
      }
    ];
    const issues = [];
    for (const { key, hint } of requiredVars) {
      if (!env[key] || env[key].startsWith("/")) {
        issues.push(
          `  ${key} = "${env[key] || ""}"  \u2192  must be a full URL, e.g. ${hint}`
        );
      }
    }
    if (issues.length > 0) {
      console.error(
        "\n[BUILD ERROR] The following VITE_ environment variables are missing or set to a relative path. In production the browser calls these URLs directly \u2014 relative paths resolve to the static frontend domain (not the backend).\n\n" + issues.join("\n") + "\n\nFix: Render \u2192 Chat Frontend (Static Site) \u2192 Environment \u2192 add the variables above, then trigger a Manual Deploy so Vite re-bakes them into the bundle.\n"
      );
      process.exit(1);
    }
  }
  let validatedBackend = env.VITE_BACKEND_URL;
  if (!validatedBackend) {
    console.warn(
      "VITE_BACKEND_URL is missing in environment variables. Falling back to http://localhost:3200"
    );
    validatedBackend = "http://localhost:3200";
  }
  return defineConfig({
    base: "/",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        yjs: path.resolve(__dirname, "node_modules/yjs"),
        "y-prosemirror": path.resolve(__dirname, "node_modules/y-prosemirror"),
        "y-protocols/awareness": path.resolve(
          __dirname,
          "node_modules/y-protocols/awareness"
        ),
        "y-protocols/sync": path.resolve(
          __dirname,
          "node_modules/y-protocols/sync"
        ),
        "@tiptap/y-tiptap": path.resolve(
          __dirname,
          "node_modules/@tiptap/y-tiptap"
        )
      }
    },
    optimizeDeps: {
      include: [
        "yjs",
        "y-prosemirror",
        "y-protocols/awareness",
        "y-protocols/sync",
        "@tiptap/y-tiptap",
        "lib0/observable",
        "lib0/binary"
      ],
      exclude: ["y-protocols"]
    },
    server: {
      port: 5174,
      proxy: {
        "/api/chat": {
          target: validatedBackend,
          changeOrigin: true
        },
        "/socket.io": {
          target: validatedBackend,
          ws: true,
          changeOrigin: true
        }
      }
    },
    build: {
      minify: "terser",
      terserOptions: {
        compress: {
          // Keep console.error and console.warn so production issues are
          // visible in the browser DevTools console. Only strip verbose logs.
          pure_funcs: ["console.log", "console.debug", "console.info"],
          drop_debugger: true
        }
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("lucide-react")) return "lucide";
              if (id.includes("@tiptap") || id.includes("tiptap"))
                return "tiptap";
              if (id.includes("framer-motion")) return "framer";
              if (id.includes("react-virtuoso")) return "virtuoso";
              if (id.includes("socket.io-client")) return "socketio";
              const modulesPath = id.split(`node_modules${path.sep}`)[1] || id.split("node_modules/")[1];
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
          }
        }
      }
    }
  });
};
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxUaXNoYVxcXFxGbG93VGFza19DaGF0X0FwcFxcXFxjbGllbnRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXFRpc2hhXFxcXEZsb3dUYXNrX0NoYXRfQXBwXFxcXGNsaWVudFxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovVGlzaGEvRmxvd1Rhc2tfQ2hhdF9BcHAvY2xpZW50L3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xyXG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSBcIkB0YWlsd2luZGNzcy92aXRlXCI7XHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XHJcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGggfSBmcm9tIFwidXJsXCI7XHJcblxyXG5jb25zdCBfX2Rpcm5hbWUgPSBwYXRoLmRpcm5hbWUoZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpKTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0ICh7IG1vZGUgfSkgPT4ge1xyXG4gIGNvbnN0IGVudiA9IGxvYWRFbnYobW9kZSwgcHJvY2Vzcy5jd2QoKSwgXCJcIik7XHJcblxyXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBQcm9kdWN0aW9uIEJ1aWxkLVRpbWUgRW52IFZhbGlkYXRpb24gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgLy8gVGhlc2UgdmFyaWFibGVzIGFyZSBiYWtlZCBpbnRvIHRoZSBKUyBidW5kbGUgYXQgYnVpbGQgdGltZSBieSBWaXRlLlxyXG4gIC8vIElmIHRoZXkgYXJlIG1pc3NpbmcgaGVyZSwgdGhlIGRlcGxveWVkIGZyb250ZW5kIHdpbGwgY2FsbCB0aGUgd3JvbmcgVVJMcy5cclxuICAvLyBTZXQgdGhlbSBpbjogUmVuZGVyIFx1MjE5MiBDaGF0IEZyb250ZW5kIFx1MjE5MiBFbnZpcm9ubWVudCBiZWZvcmUgZGVwbG95aW5nLlxyXG4gIGlmIChtb2RlID09PSBcInByb2R1Y3Rpb25cIikge1xyXG4gICAgY29uc3QgcmVxdWlyZWRWYXJzID0gW1xyXG4gICAgICB7XHJcbiAgICAgICAga2V5OiBcIlZJVEVfQVBJX0JBU0VfVVJMXCIsXHJcbiAgICAgICAgaGludDogXCJodHRwczovL2NoYXQtYXBwLWFwaS1jeXlsLm9ucmVuZGVyLmNvbS9hcGkvY2hhdFwiLFxyXG4gICAgICB9LFxyXG4gICAgICB7XHJcbiAgICAgICAga2V5OiBcIlZJVEVfU09DS0VUX1VSTFwiLFxyXG4gICAgICAgIGhpbnQ6IFwiaHR0cHM6Ly9jaGF0LWFwcC1hcGktY3l5bC5vbnJlbmRlci5jb21cIixcclxuICAgICAgfSxcclxuICAgIF07XHJcbiAgICBjb25zdCBpc3N1ZXMgPSBbXTtcclxuICAgIGZvciAoY29uc3QgeyBrZXksIGhpbnQgfSBvZiByZXF1aXJlZFZhcnMpIHtcclxuICAgICAgaWYgKCFlbnZba2V5XSB8fCBlbnZba2V5XS5zdGFydHNXaXRoKFwiL1wiKSkge1xyXG4gICAgICAgIGlzc3Vlcy5wdXNoKFxyXG4gICAgICAgICAgYCAgJHtrZXl9ID0gXCIke2VudltrZXldIHx8IFwiXCJ9XCIgIFx1MjE5MiAgbXVzdCBiZSBhIGZ1bGwgVVJMLCBlLmcuICR7aGludH1gLFxyXG4gICAgICAgICk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGlmIChpc3N1ZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFxyXG4gICAgICAgIFwiXFxuW0JVSUxEIEVSUk9SXSBUaGUgZm9sbG93aW5nIFZJVEVfIGVudmlyb25tZW50IHZhcmlhYmxlcyBhcmUgbWlzc2luZyBvciBzZXQgdG8gYSBcIiArXHJcbiAgICAgICAgICBcInJlbGF0aXZlIHBhdGguIEluIHByb2R1Y3Rpb24gdGhlIGJyb3dzZXIgY2FsbHMgdGhlc2UgVVJMcyBkaXJlY3RseSBcdTIwMTQgcmVsYXRpdmUgcGF0aHMgXCIgK1xyXG4gICAgICAgICAgXCJyZXNvbHZlIHRvIHRoZSBzdGF0aWMgZnJvbnRlbmQgZG9tYWluIChub3QgdGhlIGJhY2tlbmQpLlxcblxcblwiICtcclxuICAgICAgICAgIGlzc3Vlcy5qb2luKFwiXFxuXCIpICtcclxuICAgICAgICAgIFwiXFxuXFxuRml4OiBSZW5kZXIgXHUyMTkyIENoYXQgRnJvbnRlbmQgKFN0YXRpYyBTaXRlKSBcdTIxOTIgRW52aXJvbm1lbnQgXHUyMTkyIGFkZCB0aGUgdmFyaWFibGVzIGFib3ZlLCBcIiArXHJcbiAgICAgICAgICBcInRoZW4gdHJpZ2dlciBhIE1hbnVhbCBEZXBsb3kgc28gVml0ZSByZS1iYWtlcyB0aGVtIGludG8gdGhlIGJ1bmRsZS5cXG5cIixcclxuICAgICAgKTtcclxuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgbGV0IHZhbGlkYXRlZEJhY2tlbmQgPSBlbnYuVklURV9CQUNLRU5EX1VSTDtcclxuICBpZiAoIXZhbGlkYXRlZEJhY2tlbmQpIHtcclxuICAgIGNvbnNvbGUud2FybihcclxuICAgICAgXCJWSVRFX0JBQ0tFTkRfVVJMIGlzIG1pc3NpbmcgaW4gZW52aXJvbm1lbnQgdmFyaWFibGVzLiBGYWxsaW5nIGJhY2sgdG8gaHR0cDovL2xvY2FsaG9zdDozMjAwXCIsXHJcbiAgICApO1xyXG4gICAgdmFsaWRhdGVkQmFja2VuZCA9IFwiaHR0cDovL2xvY2FsaG9zdDozMjAwXCI7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gZGVmaW5lQ29uZmlnKHtcclxuICAgIGJhc2U6IFwiL1wiLFxyXG5cclxuICAgIHBsdWdpbnM6IFtyZWFjdCgpLCB0YWlsd2luZGNzcygpXSxcclxuXHJcbiAgICByZXNvbHZlOiB7XHJcbiAgICAgIGFsaWFzOiB7XHJcbiAgICAgICAgeWpzOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIm5vZGVfbW9kdWxlcy95anNcIiksXHJcbiAgICAgICAgXCJ5LXByb3NlbWlycm9yXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwibm9kZV9tb2R1bGVzL3ktcHJvc2VtaXJyb3JcIiksXHJcbiAgICAgICAgXCJ5LXByb3RvY29scy9hd2FyZW5lc3NcIjogcGF0aC5yZXNvbHZlKFxyXG4gICAgICAgICAgX19kaXJuYW1lLFxyXG4gICAgICAgICAgXCJub2RlX21vZHVsZXMveS1wcm90b2NvbHMvYXdhcmVuZXNzXCIsXHJcbiAgICAgICAgKSxcclxuICAgICAgICBcInktcHJvdG9jb2xzL3N5bmNcIjogcGF0aC5yZXNvbHZlKFxyXG4gICAgICAgICAgX19kaXJuYW1lLFxyXG4gICAgICAgICAgXCJub2RlX21vZHVsZXMveS1wcm90b2NvbHMvc3luY1wiLFxyXG4gICAgICAgICksXHJcbiAgICAgICAgXCJAdGlwdGFwL3ktdGlwdGFwXCI6IHBhdGgucmVzb2x2ZShcclxuICAgICAgICAgIF9fZGlybmFtZSxcclxuICAgICAgICAgIFwibm9kZV9tb2R1bGVzL0B0aXB0YXAveS10aXB0YXBcIixcclxuICAgICAgICApLFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuXHJcbiAgICBvcHRpbWl6ZURlcHM6IHtcclxuICAgICAgaW5jbHVkZTogW1xyXG4gICAgICAgIFwieWpzXCIsXHJcbiAgICAgICAgXCJ5LXByb3NlbWlycm9yXCIsXHJcbiAgICAgICAgXCJ5LXByb3RvY29scy9hd2FyZW5lc3NcIixcclxuICAgICAgICBcInktcHJvdG9jb2xzL3N5bmNcIixcclxuICAgICAgICBcIkB0aXB0YXAveS10aXB0YXBcIixcclxuICAgICAgICBcImxpYjAvb2JzZXJ2YWJsZVwiLFxyXG4gICAgICAgIFwibGliMC9iaW5hcnlcIixcclxuICAgICAgXSxcclxuICAgICAgZXhjbHVkZTogW1wieS1wcm90b2NvbHNcIl0sXHJcbiAgICB9LFxyXG5cclxuICAgIHNlcnZlcjoge1xyXG4gICAgICBwb3J0OiA1MTc0LFxyXG4gICAgICBwcm94eToge1xyXG4gICAgICAgIFwiL2FwaS9jaGF0XCI6IHtcclxuICAgICAgICAgIHRhcmdldDogdmFsaWRhdGVkQmFja2VuZCxcclxuICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiL3NvY2tldC5pb1wiOiB7XHJcbiAgICAgICAgICB0YXJnZXQ6IHZhbGlkYXRlZEJhY2tlbmQsXHJcbiAgICAgICAgICB3czogdHJ1ZSxcclxuICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuXHJcbiAgICBidWlsZDoge1xyXG4gICAgICBtaW5pZnk6IFwidGVyc2VyXCIsXHJcbiAgICAgIHRlcnNlck9wdGlvbnM6IHtcclxuICAgICAgICBjb21wcmVzczoge1xyXG4gICAgICAgICAgLy8gS2VlcCBjb25zb2xlLmVycm9yIGFuZCBjb25zb2xlLndhcm4gc28gcHJvZHVjdGlvbiBpc3N1ZXMgYXJlXHJcbiAgICAgICAgICAvLyB2aXNpYmxlIGluIHRoZSBicm93c2VyIERldlRvb2xzIGNvbnNvbGUuIE9ubHkgc3RyaXAgdmVyYm9zZSBsb2dzLlxyXG4gICAgICAgICAgcHVyZV9mdW5jczogW1wiY29uc29sZS5sb2dcIiwgXCJjb25zb2xlLmRlYnVnXCIsIFwiY29uc29sZS5pbmZvXCJdLFxyXG4gICAgICAgICAgZHJvcF9kZWJ1Z2dlcjogdHJ1ZSxcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgICAgb3V0cHV0OiB7XHJcbiAgICAgICAgICBtYW51YWxDaHVua3MoaWQpIHtcclxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwibm9kZV9tb2R1bGVzXCIpKSB7XHJcbiAgICAgICAgICAgICAgLy8gUHJlZmVyIGV4cGxpY2l0IGhlYXZ5LWxpYnMgY2h1bmtpbmcgZm9yIHByZWRpY3RhYmlsaXR5XHJcbiAgICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwibHVjaWRlLXJlYWN0XCIpKSByZXR1cm4gXCJsdWNpZGVcIjtcclxuICAgICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoXCJAdGlwdGFwXCIpIHx8IGlkLmluY2x1ZGVzKFwidGlwdGFwXCIpKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIFwidGlwdGFwXCI7XHJcbiAgICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwiZnJhbWVyLW1vdGlvblwiKSkgcmV0dXJuIFwiZnJhbWVyXCI7XHJcbiAgICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwicmVhY3QtdmlydHVvc29cIikpIHJldHVybiBcInZpcnR1b3NvXCI7XHJcbiAgICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwic29ja2V0LmlvLWNsaWVudFwiKSkgcmV0dXJuIFwic29ja2V0aW9cIjtcclxuXHJcbiAgICAgICAgICAgICAgLy8gR2VuZXJpYyBwZXItcGFja2FnZSBjaHVua2luZzogcGxhY2UgZWFjaCBub2RlX21vZHVsZSBwYWNrYWdlIGludG8gaXRzIG93biBjaHVua1xyXG4gICAgICAgICAgICAgIGNvbnN0IG1vZHVsZXNQYXRoID1cclxuICAgICAgICAgICAgICAgIGlkLnNwbGl0KGBub2RlX21vZHVsZXMke3BhdGguc2VwfWApWzFdIHx8XHJcbiAgICAgICAgICAgICAgICBpZC5zcGxpdChcIm5vZGVfbW9kdWxlcy9cIilbMV07XHJcbiAgICAgICAgICAgICAgaWYgKG1vZHVsZXNQYXRoKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJ0cyA9IG1vZHVsZXNQYXRoLnNwbGl0KC9bL1xcXFxcXFxcXS8pO1xyXG4gICAgICAgICAgICAgICAgbGV0IHBrZyA9IHBhcnRzWzBdO1xyXG4gICAgICAgICAgICAgICAgaWYgKHBrZy5zdGFydHNXaXRoKFwiQFwiKSAmJiBwYXJ0cy5sZW5ndGggPiAxKVxyXG4gICAgICAgICAgICAgICAgICBwa2cgPSBgJHtwa2d9LyR7cGFydHNbMV19YDtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5hbWUgPSBwa2cucmVwbGFjZShcIkBcIiwgXCJcIikucmVwbGFjZShcIi9cIiwgXCItXCIpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGB2ZW5kb3ItJHtuYW1lfWA7XHJcbiAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICByZXR1cm4gXCJ2ZW5kb3JcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICB9KTtcclxufTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUE2UixTQUFTLGNBQWMsZUFBZTtBQUNuVSxPQUFPLFdBQVc7QUFDbEIsT0FBTyxpQkFBaUI7QUFDeEIsT0FBTyxVQUFVO0FBQ2pCLFNBQVMscUJBQXFCO0FBSm1KLElBQU0sMkNBQTJDO0FBTWxPLElBQU0sWUFBWSxLQUFLLFFBQVEsY0FBYyx3Q0FBZSxDQUFDO0FBRTdELElBQU8sc0JBQVEsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUMzQixRQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFNM0MsTUFBSSxTQUFTLGNBQWM7QUFDekIsVUFBTSxlQUFlO0FBQUEsTUFDbkI7QUFBQSxRQUNFLEtBQUs7QUFBQSxRQUNM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
