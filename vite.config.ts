import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      devOptions: {
        enabled: true,
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6MB limit to handle Monaco editor assets
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            // NetworkOnly strategy for all real-time/database/AI endpoints to ensure fresh communication
            urlPattern: ({ url }) => {
              const isSupabase = url.hostname.includes("supabase.co");
              const isSocketIO = url.pathname.includes("socket.io") || url.hostname.includes("localhost") && url.port === "3001";
              const isOpenRouter = url.hostname.includes("openrouter.ai");
              return isSupabase || isSocketIO || isOpenRouter;
            },
            handler: "NetworkOnly",
          },
        ],
      },
      manifest: {
        name: "TraceCode",
        short_name: "TraceCode",
        description: "Code Monitoring and AI Fraud Detection Platform",
        theme_color: "#0b0f19",
        background_color: "#0b0f19",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "logo.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-192-maskable.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(
      process.env.VITE_BUILD_ID || `build-${Math.floor(Date.now() / 1000)}`
    ),
  },
}));
