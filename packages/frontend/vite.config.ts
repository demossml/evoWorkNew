import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt", // баннер с кнопкой «Обновить» вместо автообновления
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
          // Dashboard — StaleWhileRevalidate (быстрый показ + фоновое обновление)
          {
            urlPattern: /\/api\/evotor\/(sales-today|sales-garden-report|plan-for-today|accessories-sales|gross-profit-today|dashboard-home-insights)/,
            handler: "StaleWhileRevalidate" as const,
            options: {
              cacheName: "dashboard-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 5 * 60 },
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
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "offline.html"],
      manifest: {
        name: "Evo App",
        short_name: "Evo",
        description: "Отчёты и аналитика для Evotor",
        theme_color: "#f9fafb",
        background_color: "#f9fafb",
        display: "standalone",
        start_url: "/",
        lang: "ru",
        dir: "ltr",
        scope: "/",
        categories: ["business", "finance"],
        launch_handler: { client_mode: "focus-existing" },
        handle_links: "preferred",
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
            src: "/pwa-512x512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          {
            src: "/screenshots/home-light.png",
            sizes: "1080x1920",
            type: "image/png",
            form_factor: "narrow",
            label: "Главная страница",
          },
          {
            src: "/screenshots/report-light.png",
            sizes: "1080x1920",
            type: "image/png",
            form_factor: "narrow",
            label: "Отчёт по продажам",
          },
        ],
        shortcuts: [
          {
            name: "Продажи сегодня",
            short_name: "Продажи",
            description: "Посмотреть продажи за сегодня",
            url: "/evotor/sales-today",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }],
          },
          {
            name: "Зарплата",
            short_name: "Зарплата",
            description: "Посмотреть зарплату",
            url: "/evotor/salary-user-report",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }],
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
      "/api": "http://localhost:3000",
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
