import { defineConfig } from 'vite';
import { resolve } from 'path';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages 项目页面需要设置基础路径
  base: process.env.GITHUB_PAGES ? '/manga-reader-pwa/' : '/',
  plugins: [
    preact(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50MB for manga images
        runtimeCaching: [
          {
            // 缓存漫画图片
            urlPattern: /^https?:\/.+\.(webp|png|jpg|jpeg|gif|bmp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'manga-images',
              expiration: {
                maxEntries: 5000,
                maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // 缓存 API 响应（策略：先网络后缓存）
            urlPattern: /\.(json|js|css)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
              },
            },
          },
          {
            // 默认缓存策略
            urlPattern: /.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'default-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 24 * 60 * 60, // 1 day
              },
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
      manifest: {
        name: 'Manga Reader',
        short_name: 'MangaReader',
        description: 'A PWA manga reader with plugin support',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        scope: '.',
        start_url: '.',
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@routes': resolve(__dirname, 'src/routes'),
      '@pages': resolve(__dirname, 'src/pages'),
      '@stores': resolve(__dirname, 'src/stores'),
      '@types': resolve(__dirname, 'src/types'),
      '@plugins': resolve(__dirname, 'src/plugins'),
      '@db': resolve(__dirname, 'src/db'),
      '@fs': resolve(__dirname, 'src/fs'),
      '@framework': resolve(__dirname, 'src/framework')
    }
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'framework': ['./src/framework/index.ts'],
          'vendor': ['preact']
        }
      }
    }
  }
});
