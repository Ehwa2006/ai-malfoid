import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const ollamaTarget = env.OLLAMA_HOST || 'http://127.0.0.1:11434'

  return {
    plugins: [vue()],
    server: {
      // 브라우저 → Ollama 직접 호출 시 CORS 문제가 생기므로 dev 서버에서 프록시한다.
      proxy: {
        '/ollama': {
          target: ollamaTarget,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/ollama/, ''),
        },
      },
    },
  }
})
