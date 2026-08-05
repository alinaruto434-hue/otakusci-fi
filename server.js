import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, 'dist')
const port = Number(process.env.PORT || 4173)

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

const fetchRemoteHtml = async (targetUrl) => {
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  })

  const contentType = response.headers.get('content-type') || 'text/html'
  const body = await response.text()

  return {
    status: response.status,
    contentType,
    body,
  }
}

const rewriteEmbeddedHtml = (html, baseUrl) => {
  const baseTag = `<base href="${baseUrl}">`
  return html
    .replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '')
    .replace(/<meta[^>]+http-equiv=["']X-Frame-Options["'][^>]*>/gi, '')
    .replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
}

const getStaticFile = async (pathname) => {
  const filePath = join(distDir, pathname === '/' ? '/index.html' : pathname)
  try {
    await stat(filePath)
    return filePath
  } catch {
    return null
  }
}

const serveFile = (res, filePath) => {
  const ext = extname(filePath)
  const contentType = mimeTypes[ext] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': contentType })
  createReadStream(filePath).pipe(res)
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  if (req.url.startsWith('/proxy')) {
    try {
      const requestUrl = new URL(req.url, 'http://localhost')
      const target = requestUrl.searchParams.get('url')
      if (!target) {
        res.writeHead(400)
        res.end('Missing url parameter')
        return
      }

      const decodedUrl = decodeURIComponent(target)
      const remote = await fetchRemoteHtml(decodedUrl)
      res.writeHead(remote.status, { 'Content-Type': remote.contentType })

      if (remote.contentType.includes('text/html')) {
        res.end(rewriteEmbeddedHtml(remote.body, decodedUrl))
      } else {
        res.end(remote.body)
      }
    } catch (error) {
      res.writeHead(502)
      res.end('Failed to load remote content')
    }

    return
  }

  const requestUrl = new URL(req.url, 'http://localhost')
  const pathname = decodeURIComponent(requestUrl.pathname)
  const filePath = await getStaticFile(pathname)

  if (filePath) {
    serveFile(res, filePath)
    return
  }

  const indexFile = join(distDir, 'index.html')
  serveFile(res, indexFile)
})

server.listen(port, () => {
  console.log(`Static server listening on http://localhost:${port}`)
})
