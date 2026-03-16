import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@pixiv/three-vrm'))
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
