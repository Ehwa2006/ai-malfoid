import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { edgeTts } from './server/edgeTts'

/** OLLAMA_HOST 값("0.0.0.0", "127.0.0.1:11434", "http://host:port")을 접속 주소로 바꾼다 (Ollama와 같은 해석) */
function ollamaOrigin(value?: string) {
  const url = new URL(/^https?:\/\//.test(value || '') ? value! : `http://${value || '127.0.0.1:11434'}`)
  if (!url.port)
    url.port = '11434'
  if (url.hostname === '0.0.0.0')
    url.hostname = '127.0.0.1'
  return url.origin
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const ollamaTarget = ollamaOrigin(env.OLLAMA_HOST)

  return {
    plugins: [vue(), edgeTts()],
    // three.js 청크(약 670kB)는 아바타 컴포넌트와 함께 지연 로딩된다
    build: { chunkSizeWarningLimit: 800 },
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
