// vite.config.js
import { defineConfig, loadEnv } from "file:///C:/Users/pc/OneDrive/Desktop/New%20folder/FlowTask_Chat_App/client/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/pc/OneDrive/Desktop/New%20folder/FlowTask_Chat_App/client/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///C:/Users/pc/OneDrive/Desktop/New%20folder/FlowTask_Chat_App/client/node_modules/@tailwindcss/vite/dist/index.mjs";
var vite_config_default = ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (mode === "production") {
    const requiredVars = [
      { key: "VITE_API_BASE_URL", hint: "https://flowtask-chat-app.onrender.com/api/chat" },
      { key: "VITE_SOCKET_URL", hint: "https://flowtask-chat-app.onrender.com" }
    ];
    const issues = [];
    for (const { key, hint } of requiredVars) {
      if (!env[key] || env[key].startsWith("/")) {
        issues.push(`  ${key} = "${env[key] || ""}"  \u2192  must be a full URL, e.g. ${hint}`);
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
      }
    }
  });
};
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxwY1xcXFxPbmVEcml2ZVxcXFxEZXNrdG9wXFxcXE5ldyBmb2xkZXJcXFxcRmxvd1Rhc2tfQ2hhdF9BcHBcXFxcY2xpZW50XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxwY1xcXFxPbmVEcml2ZVxcXFxEZXNrdG9wXFxcXE5ldyBmb2xkZXJcXFxcRmxvd1Rhc2tfQ2hhdF9BcHBcXFxcY2xpZW50XFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9wYy9PbmVEcml2ZS9EZXNrdG9wL05ldyUyMGZvbGRlci9GbG93VGFza19DaGF0X0FwcC9jbGllbnQvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcsIGxvYWRFbnYgfSBmcm9tIFwidml0ZVwiXHJcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3RcIlxyXG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSBcIkB0YWlsd2luZGNzcy92aXRlXCJcclxuXHJcbmV4cG9ydCBkZWZhdWx0ICh7IG1vZGUgfSkgPT4ge1xyXG4gIGNvbnN0IGVudiA9IGxvYWRFbnYobW9kZSwgcHJvY2Vzcy5jd2QoKSwgXCJcIilcclxuXHJcbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFByb2R1Y3Rpb24gQnVpbGQtVGltZSBFbnYgVmFsaWRhdGlvbiBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuICAvLyBUaGVzZSB2YXJpYWJsZXMgYXJlIGJha2VkIGludG8gdGhlIEpTIGJ1bmRsZSBhdCBidWlsZCB0aW1lIGJ5IFZpdGUuXHJcbiAgLy8gSWYgdGhleSBhcmUgbWlzc2luZyBoZXJlLCB0aGUgZGVwbG95ZWQgZnJvbnRlbmQgd2lsbCBjYWxsIHRoZSB3cm9uZyBVUkxzLlxyXG4gIC8vIFNldCB0aGVtIGluOiBSZW5kZXIgXHUyMTkyIENoYXQgRnJvbnRlbmQgXHUyMTkyIEVudmlyb25tZW50IGJlZm9yZSBkZXBsb3lpbmcuXHJcbiAgaWYgKG1vZGUgPT09ICdwcm9kdWN0aW9uJykge1xyXG4gICAgY29uc3QgcmVxdWlyZWRWYXJzID0gW1xyXG4gICAgICB7IGtleTogJ1ZJVEVfQVBJX0JBU0VfVVJMJywgaGludDogJ2h0dHBzOi8vZmxvd3Rhc2stY2hhdC1hcHAub25yZW5kZXIuY29tL2FwaS9jaGF0JyB9LFxyXG4gICAgICB7IGtleTogJ1ZJVEVfU09DS0VUX1VSTCcsICAgaGludDogJ2h0dHBzOi8vZmxvd3Rhc2stY2hhdC1hcHAub25yZW5kZXIuY29tJyB9LFxyXG4gICAgXVxyXG4gICAgY29uc3QgaXNzdWVzID0gW11cclxuICAgIGZvciAoY29uc3QgeyBrZXksIGhpbnQgfSBvZiByZXF1aXJlZFZhcnMpIHtcclxuICAgICAgaWYgKCFlbnZba2V5XSB8fCBlbnZba2V5XS5zdGFydHNXaXRoKCcvJykpIHtcclxuICAgICAgICBpc3N1ZXMucHVzaChgICAke2tleX0gPSBcIiR7ZW52W2tleV0gfHwgJyd9XCIgIFx1MjE5MiAgbXVzdCBiZSBhIGZ1bGwgVVJMLCBlLmcuICR7aGludH1gKVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBpZiAoaXNzdWVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcclxuICAgICAgICAnXFxuW0JVSUxEIEVSUk9SXSBUaGUgZm9sbG93aW5nIFZJVEVfIGVudmlyb25tZW50IHZhcmlhYmxlcyBhcmUgbWlzc2luZyBvciBzZXQgdG8gYSAnICtcclxuICAgICAgICAncmVsYXRpdmUgcGF0aC4gSW4gcHJvZHVjdGlvbiB0aGUgYnJvd3NlciBjYWxscyB0aGVzZSBVUkxzIGRpcmVjdGx5IFx1MjAxNCByZWxhdGl2ZSBwYXRocyAnICtcclxuICAgICAgICAncmVzb2x2ZSB0byB0aGUgc3RhdGljIGZyb250ZW5kIGRvbWFpbiAobm90IHRoZSBiYWNrZW5kKS5cXG5cXG4nICtcclxuICAgICAgICBpc3N1ZXMuam9pbignXFxuJykgK1xyXG4gICAgICAgICdcXG5cXG5GaXg6IFJlbmRlciBcdTIxOTIgQ2hhdCBGcm9udGVuZCAoU3RhdGljIFNpdGUpIFx1MjE5MiBFbnZpcm9ubWVudCBcdTIxOTIgYWRkIHRoZSB2YXJpYWJsZXMgYWJvdmUsICcgK1xyXG4gICAgICAgICd0aGVuIHRyaWdnZXIgYSBNYW51YWwgRGVwbG95IHNvIFZpdGUgcmUtYmFrZXMgdGhlbSBpbnRvIHRoZSBidW5kbGUuXFxuJ1xyXG4gICAgICApXHJcbiAgICAgIHByb2Nlc3MuZXhpdCgxKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgbGV0IHZhbGlkYXRlZEJhY2tlbmQgPSBlbnYuVklURV9CQUNLRU5EX1VSTFxyXG4gIGlmICghdmFsaWRhdGVkQmFja2VuZCkge1xyXG4gICAgY29uc29sZS53YXJuKFwiVklURV9CQUNLRU5EX1VSTCBpcyBtaXNzaW5nIGluIGVudmlyb25tZW50IHZhcmlhYmxlcy4gRmFsbGluZyBiYWNrIHRvIGh0dHA6Ly9sb2NhbGhvc3Q6MzIwMFwiKTtcclxuICAgIHZhbGlkYXRlZEJhY2tlbmQgPSBcImh0dHA6Ly9sb2NhbGhvc3Q6MzIwMFwiO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGRlZmluZUNvbmZpZyh7XHJcbiAgICBiYXNlOiBcIi9cIixcclxuXHJcbiAgICBwbHVnaW5zOiBbcmVhY3QoKSwgdGFpbHdpbmRjc3MoKV0sXHJcblxyXG4gICAgc2VydmVyOiB7XHJcbiAgICAgIHBvcnQ6IDUxNzQsXHJcbiAgICAgIHByb3h5OiB7XHJcbiAgICAgICAgXCIvYXBpL2NoYXRcIjoge1xyXG4gICAgICAgICAgdGFyZ2V0OiB2YWxpZGF0ZWRCYWNrZW5kLFxyXG4gICAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCIvc29ja2V0LmlvXCI6IHtcclxuICAgICAgICAgIHRhcmdldDogdmFsaWRhdGVkQmFja2VuZCxcclxuICAgICAgICAgIHdzOiB0cnVlLFxyXG4gICAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG5cclxuICAgIGJ1aWxkOiB7XHJcbiAgICAgIG1pbmlmeTogXCJ0ZXJzZXJcIixcclxuICAgICAgdGVyc2VyT3B0aW9uczoge1xyXG4gICAgICAgIGNvbXByZXNzOiB7XHJcbiAgICAgICAgICAvLyBLZWVwIGNvbnNvbGUuZXJyb3IgYW5kIGNvbnNvbGUud2FybiBzbyBwcm9kdWN0aW9uIGlzc3VlcyBhcmVcclxuICAgICAgICAgIC8vIHZpc2libGUgaW4gdGhlIGJyb3dzZXIgRGV2VG9vbHMgY29uc29sZS4gT25seSBzdHJpcCB2ZXJib3NlIGxvZ3MuXHJcbiAgICAgICAgICBwdXJlX2Z1bmNzOiBbJ2NvbnNvbGUubG9nJywgJ2NvbnNvbGUuZGVidWcnLCAnY29uc29sZS5pbmZvJ10sXHJcbiAgICAgICAgICBkcm9wX2RlYnVnZ2VyOiB0cnVlLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gIH0pXHJcbn0iXSwKICAibWFwcGluZ3MiOiAiO0FBQW9ZLFNBQVMsY0FBYyxlQUFlO0FBQzFhLE9BQU8sV0FBVztBQUNsQixPQUFPLGlCQUFpQjtBQUV4QixJQUFPLHNCQUFRLENBQUMsRUFBRSxLQUFLLE1BQU07QUFDM0IsUUFBTSxNQUFNLFFBQVEsTUFBTSxRQUFRLElBQUksR0FBRyxFQUFFO0FBTTNDLE1BQUksU0FBUyxjQUFjO0FBQ3pCLFVBQU0sZUFBZTtBQUFBLE1BQ25CLEVBQUUsS0FBSyxxQkFBcUIsTUFBTSxrREFBa0Q7QUFBQSxNQUNwRixFQUFFLEtBQUssbUJBQXFCLE1BQU0seUNBQXlDO0FBQUEsSUFDN0U7QUFDQSxVQUFNLFNBQVMsQ0FBQztBQUNoQixlQUFXLEVBQUUsS0FBSyxLQUFLLEtBQUssY0FBYztBQUN4QyxVQUFJLENBQUMsSUFBSSxHQUFHLEtBQUssSUFBSSxHQUFHLEVBQUUsV0FBVyxHQUFHLEdBQUc7QUFDekMsZUFBTyxLQUFLLEtBQUssR0FBRyxPQUFPLElBQUksR0FBRyxLQUFLLEVBQUUsdUNBQWtDLElBQUksRUFBRTtBQUFBLE1BQ25GO0FBQUEsSUFDRjtBQUNBLFFBQUksT0FBTyxTQUFTLEdBQUc7QUFDckIsY0FBUTtBQUFBLFFBQ04sNE9BR0EsT0FBTyxLQUFLLElBQUksSUFDaEI7QUFBQSxNQUVGO0FBQ0EsY0FBUSxLQUFLLENBQUM7QUFBQSxJQUNoQjtBQUFBLEVBQ0Y7QUFFQSxNQUFJLG1CQUFtQixJQUFJO0FBQzNCLE1BQUksQ0FBQyxrQkFBa0I7QUFDckIsWUFBUSxLQUFLLDZGQUE2RjtBQUMxRyx1QkFBbUI7QUFBQSxFQUNyQjtBQUVBLFNBQU8sYUFBYTtBQUFBLElBQ2xCLE1BQU07QUFBQSxJQUVOLFNBQVMsQ0FBQyxNQUFNLEdBQUcsWUFBWSxDQUFDO0FBQUEsSUFFaEMsUUFBUTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLFFBQ0wsYUFBYTtBQUFBLFVBQ1gsUUFBUTtBQUFBLFVBQ1IsY0FBYztBQUFBLFFBQ2hCO0FBQUEsUUFDQSxjQUFjO0FBQUEsVUFDWixRQUFRO0FBQUEsVUFDUixJQUFJO0FBQUEsVUFDSixjQUFjO0FBQUEsUUFDaEI7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLElBRUEsT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLE1BQ1IsZUFBZTtBQUFBLFFBQ2IsVUFBVTtBQUFBO0FBQUE7QUFBQSxVQUdSLFlBQVksQ0FBQyxlQUFlLGlCQUFpQixjQUFjO0FBQUEsVUFDM0QsZUFBZTtBQUFBLFFBQ2pCO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGLENBQUM7QUFDSDsiLAogICJuYW1lcyI6IFtdCn0K
