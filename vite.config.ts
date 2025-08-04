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
  plugins: [
    react(),
    copyRedirectsPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true, // ✅ activer PWA aussi en dev
      },
      includeAssets: [
        'favicon.ico',
        'icon-192.png',
        'icon-512.png',
        'splash.png'
      ],
      manifest: {
        name: 'Teliya',
        short_name: 'Teliya',
        description: 'Réservation de billets en ligne et au guichet',
        theme_color: '#FFD700',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: './postcss.config.cjs',
    preprocessorOptions: {
      scss: {
        additionalData: `@import "@/assets/styles/_variables.scss";`,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-router-dom'))
              return 'react';
            if (id.includes('firebase')) return 'firebase';
            if (
              id.includes('lodash') ||
              id.includes('axios') ||
              id.includes('date-fns')
            )
              return 'vendor';
          }
          if (id.includes('/src/pages/Compagnie/')) return 'compagnie';
          if (id.includes('/src/pages/Agence/')) return 'agence';
          if (id.includes('/src/pages/Admin/')) return 'admin';
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
    fs: {
      strict: false,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 5191,
    strictPort: true,
  },
});
