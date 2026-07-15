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
        enabled: false, // ⚡️ отключено в dev — SW перехватывает /api/* запросы и спамит в консоль
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/,
            handler: "NetworkOnly" as const,
            options: { cacheName: "api-cache", expiration: { maxEntries: 0 } },
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
