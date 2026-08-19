import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

// Simple plugin that copies preload.js as-is (no bundling/transforming)
function copyPreload() {
  return {
    name: 'copy-preload',
    buildStart() {
      const src = path.resolve('electron/preload.js')
      const destDir = path.resolve('dist-electron')
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
      fs.copyFileSync(src, path.join(destDir, 'preload.js'))
    },
    configureServer(server) {
      // Also copy during dev server startup
      const src = path.resolve('electron/preload.js')
      const destDir = path.resolve('dist-electron')
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
      fs.copyFileSync(src, path.join(destDir, 'preload.js'))
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    copyPreload(),
    electron([
      {
        entry: 'electron/main.js',
        vite: {
          build: {
            rollupOptions: {
              external: ['express', 'socket.io', 'formidable', 'youtube-dl-exec', 'ffmpeg-static']
            }
          }
        }
      },
    ]),
    renderer(),
  ],
})
