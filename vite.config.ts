import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@pixiv/three-vrm') || id.includes('@pixiv/three-vrm-animation'))
            return 'vrm-runtime'

          if (id.includes('/three/examples/'))
            return 'three-examples'

          if (id.includes('/three/'))
            return 'three-runtime'

          if (id.includes('/vue/') || id.includes('@vue/'))
            return 'vue-core'

          if (id.includes('idb-keyval'))
            return 'app-storage'
        },
      },
    },
  },
})
