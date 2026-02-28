// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';
import { copyFileSync, existsSync } from 'fs';
import { VitePWA } from 'vite-plugin-pwa';

function copyRedirectsPlugin() {
  return {
    name: 'copy-redirects',
    closeBundle() {
      const src = path.resolve(__dirname, 'public/_redirects');
      const dest = path.resolve(__dirname, 'dist/_redirects');
      if (existsSync(src)) {
        try {
          copyFileSync(src, dest);
          console.log('✅ Fichier _redirects copié avec succès.');
        } catch (err) {
          console.warn('❌ Erreur de copie _redirects :', err);
        }
      } else {
        console.warn('⚠️ Aucun fichier _redirects trouvé dans /public');
      }
    },
  };
}

export default defineConfig({
  base: '/',
  assetsInclude: ['**/*.png', '**/*.svg', '**/*.jpg', '**/*.jpeg', '**/*.webp'],
  plugins: [
    react({
      jsxImportSource: '@emotion/react',
      babel: { plugins: ['@emotion/babel-plugin'] },
    }),
    copyRedirectsPlugin(),
    VitePWA({
      /* prompt = pas de rechargement auto : bannière "Nouvelle version" puis rechargement au clic uniquement */
      registerType: 'prompt',
      /* ⛔️ important : pas de PWA en DEV */
      devOptions: { enabled: false },
      includeAssets: ['favicon.ico', 'icons/*.png', 'images/*.{png,svg,jpg}'],
      manifest: {
        name: 'Teliya',
        short_name: 'Teliya',
        id: '/',
        description: 'Réservation de billets en ligne et au guichet',
        theme_color: '#FF6600',
        background_color: '#FF6600',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'fr',
        dir: 'ltr',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
        screenshots: [
          { src: '/screenshots/desktop-wide.png', sizes: '1920x1080', type: 'image/png', form_factor: 'wide', label: 'Teliya - Version Bureau' },
          { src: '/screenshots/mobile-narrow.png', sizes: '1080x1920', type: 'image/png', form_factor: 'narrow', label: 'Teliya - Version Mobile' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        cleanupOutdatedCaches: true,
        // vendor chunk can exceed 2 MiB; allow precache up to 4 MiB per file (Netlify build)
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@images': path.resolve(__dirname, './public/images'),
    },
  },
  css: {
    postcss: './postcss.config.cjs',
    preprocessorOptions: {
      scss: { additionalData: `@import "@assets/styles/_variables.scss";` },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('react-router')) return 'router';
            if (id.includes('lucide-react')) return 'icons';
            return 'vendor';
          }
          if (id.includes('/src/modules/compagnie/')) return 'compagnie';
          if (id.includes('/src/modules/agence/')) return 'agence';
          if (id.includes('/src/modules/logistics/')) return 'courier';
          if (id.includes('/src/modules/ceo/')) return 'ceo';
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5190,
    strictPort: false,
    open: true,
    fs: { strict: false },
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true, secure: false },
    },
  },
  preview: { port: 5191, strictPort: true },
});
