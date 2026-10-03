import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

// Simple plugin that copies preload.js and region.html as-is (no bundling/transforming)
function copyPreload() {
  return {
    name: 'copy-preload',
    buildStart() {
      const src = path.resolve('electron/preload.js')
      const destDir = path.resolve('dist-electron')
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
      fs.copyFileSync(src, path.join(destDir, 'preload.js'))
      
      const regionSrc = path.resolve('electron/region.html')
      if (fs.existsSync(regionSrc)) {
        fs.copyFileSync(regionSrc, path.join(destDir, 'region.html'))
      }
      const borderSrc = path.resolve('electron/border.html')
      if (fs.existsSync(borderSrc)) {
        fs.copyFileSync(borderSrc, path.join(destDir, 'border.html'))
      }
      const controlsSrc = path.resolve('electron/controls.html')
      if (fs.existsSync(controlsSrc)) {
        fs.copyFileSync(controlsSrc, path.join(destDir, 'controls.html'))
      }
    },
    configureServer(server) {
      // Also copy during dev server startup
      const src = path.resolve('electron/preload.js')
      const destDir = path.resolve('dist-electron')
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
      fs.copyFileSync(src, path.join(destDir, 'preload.js'))

      const regionSrc = path.resolve('electron/region.html')
      if (fs.existsSync(regionSrc)) {
        fs.copyFileSync(regionSrc, path.join(destDir, 'region.html'))
      }
      const borderSrc = path.resolve('electron/border.html')
      if (fs.existsSync(borderSrc)) {
        fs.copyFileSync(borderSrc, path.join(destDir, 'border.html'))
      }
      const controlsSrc = path.resolve('electron/controls.html')
      if (fs.existsSync(controlsSrc)) {
        fs.copyFileSync(controlsSrc, path.join(destDir, 'controls.html'))
      }
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
  server: {
    watch: {
      ignored: ['**/release/**', '**/dist/**', '**/dist-electron/**', '**/scratch*/**']
    }
  }
})
