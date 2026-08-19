import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'ТуТу План Б',
        short_name: 'План Б',
        description: 'Стресс-тест плана поездки до покупки: риски, устойчивость и план Б.',
        lang: 'ru-RU',
        start_url: '/',
        display: 'standalone',
        background_color: '#edf6ff',
        theme_color: '#171255',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Кэш ответов API не настраивается намеренно: цена и доступность из кэша,
        // выданные как актуальные, — прямое нарушение §14.3. Последний план хранится
        // отдельно в IndexedDB и всегда помечается как возможно устаревший.
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Глобус и данные суши выносятся из основного бандла: shell обязан стать
        // интерактивным до загрузки MapLibre (§18.2).
        manualChunks(id: string) {
          if (id.includes('maplibre-gl')) return 'maplibre';
          if (id.includes('world-atlas') || id.includes('topojson')) return 'geodata';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        // Поток плана живёт десятки секунд: дефолтный таймаут прокси оборвал бы NDJSON.
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
    },
  },
});
