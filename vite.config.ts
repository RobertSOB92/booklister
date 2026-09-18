import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: "Booklister",
        short_name: "Booklister",
        description: "Rozpoznawanie książek na podstawie zdjęć okładek przy użyciu Google Gemini.",
        start_url: "/",
        display: "standalone",
        orientation: "any",
        theme_color: "#1f2937",
        background_color: "#f9fafb",
        icons: [
          {
            src: "/icons/icon.svg",
            sizes: "any",
            type: "image/svg+xml"
          }
        ]
      }
    })
  ],
})
