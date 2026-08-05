import { defineConfig } from 'vite'
import type { ViteDevServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

const fetchRemoteHtml = async (targetUrl: string) => {
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  })

  const contentType = response.headers.get('content-type') ?? 'text/html'
  const body = await response.text()

  return {
    status: response.status,
    contentType,
    body,
  }
}

const rewriteEmbeddedHtml = (html: string, baseUrl: string) => {
  const baseTag = `<base href="${baseUrl}">`
  return html
    .replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '')
    .replace(/<meta[^>]+http-equiv=["']X-Frame-Options["'][^>]*>/gi, '')
    .replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
}

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'vidmoly-proxy',
      configureServer(server: ViteDevServer) {
        server.middlewares.use('/proxy', async (req, res, next) => {
          if (req.method !== 'GET' || !req.url) {
            return next()
          }

          const requestUrl = new URL(req.url, 'http://localhost')
          const target = requestUrl.searchParams.get('url')

          if (!target) {
            res.statusCode = 400
            res.end('Missing url parameter')
            return
          }

          try {
            const decodedUrl = decodeURIComponent(target)
            const remote = await fetchRemoteHtml(decodedUrl)

            res.statusCode = remote.status
            res.setHeader('content-type', remote.contentType)

            if (remote.contentType.includes('text/html')) {
              res.end(rewriteEmbeddedHtml(remote.body, decodedUrl))
            } else {
              res.end(remote.body)
            }
          } catch (error) {
            res.statusCode = 502
            res.end('Failed to load remote content')
          }
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
})
