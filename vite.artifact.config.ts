// 클로드 앱 아티팩트용 페이지 빌드 (npm run artifact → dist-artifact/karina.html)
// 아티팩트는 HTML 한 장으로 올리므로, 빌드한 JS·CSS를 페이지 안에 모두 넣는다.
// 아티팩트는 올릴 때 문서 뼈대(doctype·head·body)를 씌우므로 그 안에 들어갈 내용만 남긴다.
// 3D 모델(7.6MB)은 페이지에 넣지 않고 옆 파일로 두어 아티팩트에 함께 올린다.
// 아티팩트는 .vrm(glb)을 올려 주지 않으므로 base64 글자 파일(.txt)로 만든다 (artifact/modelFile.ts가 되돌린다).
import { readFileSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

const escapeClose = (code: string, tag: 'script' | 'style') => code.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`)

function singlePage(): Plugin {
  return {
    name: 'malfoid-single-page',
    enforce: 'post',
    // Vite가 자기 generateBundle에서 동적 import 자리표시(__VITE_PRELOAD__)를 채운 뒤에 넣어야 한다
    generateBundle: { order: 'post', handler(_, bundle) {
      const page = bundle['index.html']
      if (!page || page.type !== 'asset')
        throw new Error('index.html이 빌드되지 않았어요')
      const html = String(page.source)
      const scripts: string[] = []
      const styles: string[] = []
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk') {
          scripts.push(escapeClose(file.code, 'script'))
          delete bundle[name]
        }
        else if (name.endsWith('.css')) {
          styles.push(escapeClose(String(file.source), 'style'))
          delete bundle[name]
        }
      }
      if (scripts.length !== 1)
        throw new Error(`스크립트가 하나여야 해요 (${scripts.length}개)`)
      const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? ''
      const body = /<body>([\s\S]*?)<\/body>/.exec(html)?.[1] ?? ''
      const keep = (part: string) => part
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
        .replace(/<link\b[^>]*rel="(?:stylesheet|modulepreload)"[^>]*href="\.?\/?assets\/[^"]*"[^>]*>/g, '')
        .replace(/<meta charset[^>]*>|<meta name="viewport"[^>]*>/g, '')
        .split('\n').map(l => l.trim()).filter(Boolean).join('\n')
      page.fileName = 'karina.html'
      this.emitFile({ type: 'asset', fileName: 'models/malfoy-draconia.vrm.txt', source: readFileSync(new URL('./public/models/malfoy-draconia.vrm', import.meta.url)).toString('base64') })
      page.source = [
        keep(head),
        `<style>${styles.join('\n')}</style>`,
        keep(body),
        `<script type="module">${scripts[0]}</script>`,
        '',
      ].join('\n')
    } },
  }
}

export default defineConfig({
  root: 'artifact',
  base: './',
  plugins: [vue(), singlePage()],
  publicDir: false,
  build: {
    outDir: '../dist-artifact',
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
