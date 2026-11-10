// 응답 머리글을 기다리는 시간 제한이 없는 fetch.
// Node의 fetch는 머리글이 5분 안에 오지 않으면 끊는데, CPU에서 처음 모델을 올리면(수 GB) 그보다 오래 걸리기도 한다
// (Ollama는 첫 글자를 만들 때 머리글을 보낸다). 브라우저(웹 앱)는 이런 제한이 없다.
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'

export function patientFetch(url: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const u = new URL(typeof url === 'string' || url instanceof URL ? url : url.url)
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {}
    new Headers(init.headers).forEach((v, k) => { headers[k] = v })
    const req = (u.protocol === 'https:' ? httpsRequest : httpRequest)(u, { method: init.method ?? 'GET', headers }, (res) => {
      const h = new Headers()
      for (const [k, v] of Object.entries(res.headers)) {
        if (v !== undefined)
          h.set(k, Array.isArray(v) ? v.join(', ') : v)
      }
      resolve(new Response(Readable.toWeb(res) as ReadableStream, { status: res.statusCode ?? 0, headers: h }))
    })
    req.on('error', reject)
    const abort = () => req.destroy(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))
    if (init.signal?.aborted)
      return abort()
    init.signal?.addEventListener('abort', abort, { once: true })
    req.end(typeof init.body === 'string' ? init.body : undefined)
  })
}
