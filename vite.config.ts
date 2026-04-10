import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const jupiterProxyTargetRaw = (env.AIRIFICA_JUPITER_API_BASE_URL || '').trim()
  const proxy: Record<string, {
    target: string
    changeOrigin: boolean
    ws?: boolean
    rewrite?: (path: string) => string
    headers?: Record<string, string>
  }> = {
    '/api/tts': {
      target: 'http://127.0.0.1:4041',
      changeOrigin: true,
    },
  }

  const sttProxyTarget = (env.AIRIFICA_STT_PROXY_TARGET_WS_URL || '').trim()
  if (sttProxyTarget) {
    proxy['/api/stt/ws'] = {
      target: sttProxyTarget,
      changeOrigin: true,
      ws: true,
    }
  }

  if (jupiterProxyTargetRaw) {
    const targetUrl = new URL(jupiterProxyTargetRaw)
    const targetBasePath = targetUrl.pathname.replace(/\/+$/, '')
    proxy['/api/jupiter'] = {
      target: `${targetUrl.protocol}//${targetUrl.host}`,
      changeOrigin: true,
      ...(env.AIRIFICA_JUPITER_API_KEY ? { headers: { 'x-api-key': env.AIRIFICA_JUPITER_API_KEY } } : {}),
      rewrite: requestPath => `${targetBasePath}${requestPath.replace(/^\/api\/jupiter/, '') || ''}` || '/',
    }
  }

  return {
    plugins: [vue()],
    server: {
      proxy,
    },
    preview: {
      allowedHosts: [
        'airi.airewardrop.xyz',
        'app.eeess.cyou',
        'www.eeess.cyou',
        'eeess.cyou',
      ],
    },
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
  }
})
