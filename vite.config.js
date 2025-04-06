import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/peerjs': {
        target: 'https://0.peerjs.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/peerjs/, '')
      }
    }
  }
})
