import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate", // автообновление SW
      devOptions: {
        enabled: true, // включено в dev для тестирования офлайн-режима
        type: "module",
      },
      workbox: {
        navigateFallback: "/offline.html",
        navigateFallbackAllowlist: [/^\//],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          // Статика (JS/CSS) — Cache First
          {
            urlPattern: /\.(?:js|css|mjs)$/,
            handler: "CacheFirst" as const,
            method: "GET",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Шрифты — Cache First
          {
            urlPattern: /\.(?:woff|woff2|ttf|eot)$/,
            handler: "CacheFirst" as const,
            method: "GET",
            options: {
              cacheName: "fonts",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Изображения — Cache First
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: "CacheFirst" as const,
            method: "GET",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // API (GET, без salary/auth/login) — Network First
          {
            urlPattern: /^\/api\/(?!.*(salary|auth|login)).*/,
            handler: "NetworkFirst" as const,
            method: "GET",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 200, maxAgeSeconds: 5 * 60 },
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Evo App",
        short_name: "Evo",
        description: "Отчёты и аналитика для Evotor",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@app": path.resolve(__dirname, "src/app"),
      "@shared": path.resolve(__dirname, "src/shared"),
      "@widgets": path.resolve(__dirname, "src/widgets"),
      "@features": path.resolve(__dirname, "src/features"),
      "@entities": path.resolve(__dirname, "src/entities"),
      "@/hooks": path.resolve(__dirname, "src/hooks"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Фреймворк — меняется редко, кэшируется надолго
          vendor: ["react", "react-dom", "react-router", "react-router-dom"],
          // Анимации — отдельно, не блокируют первый рендер
          framer: ["framer-motion"],
          // Чарты — только для страниц с графиками
          charts: ["recharts"],
          // Иконки — тяжёлые, отдельным чанком
          icons: ["lucide-react"],
          // Утилиты — общие для всех страниц
          utils: ["date-fns", "clsx", "tailwind-merge", "zustand"],
        },
      },
    },
    // Увеличиваем лимит, чтобы не было ложных предупреждений
    chunkSizeWarningLimit: 600,
  },
});
