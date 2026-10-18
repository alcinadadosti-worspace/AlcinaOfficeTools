// Servidor estático mínimo para o auto-update (electron-updater, provedor "generic").
// Serve os arquivos de ./public, com um subdiretório por aplicativo:
//   public/<app>/latest.yml, latest-linux.yml, instaladores (.exe/.AppImage/.deb) e .blockmap
// Sem dependências — pronto para rodar no Render (Web Service Node).
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, 'public')
const PORT = process.env.PORT || 3000

const TYPES = {
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.exe': 'application/octet-stream',
  '.appimage': 'application/octet-stream',
  '.deb': 'application/octet-stream',
  '.rpm': 'application/octet-stream',
  '.zip': 'application/zip',
  '.blockmap': 'application/octet-stream',
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
}

function resolveSafe(url) {
  const clean = decodeURIComponent(url.split('?')[0])
  const rel = path.normalize(clean).replace(/^([/\\])+/, '').replace(/^(\.\.[/\\])+/, '')
  const full = path.join(ROOT, rel)
  return full.startsWith(ROOT) ? full : null
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    res.end('Method Not Allowed')
    return
  }
  const urlPath = (req.url || '/').split('?')[0]
  if (urlPath === '/' || urlPath === '') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Alcina Office — servidor de atualizacoes. OK.')
    return
  }
  const full = resolveSafe(urlPath)
  if (!full) {
    res.writeHead(400)
    res.end('Bad Request')
    return
  }
  fs.stat(full, (err, st) => {
    if (err || st.isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Not Found')
      return
    }
    const type = TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream'
    const range = req.headers.range
    const m = range && /bytes=(\d*)-(\d*)/.exec(range)
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0
      let end = m[2] ? parseInt(m[2], 10) : st.size - 1
      if (start > end || start >= st.size) {
        res.writeHead(416, { 'content-range': `bytes */${st.size}` })
        res.end()
        return
      }
      end = Math.min(end, st.size - 1)
      res.writeHead(206, {
        'content-type': type,
        'content-length': end - start + 1,
        'content-range': `bytes ${start}-${end}/${st.size}`,
        'accept-ranges': 'bytes'
      })
      if (req.method === 'HEAD') return res.end()
      fs.createReadStream(full, { start, end }).pipe(res)
      return
    }
    res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes' })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(full).pipe(res)
  })
})

server.listen(PORT, () => console.log(`Servidor de atualizacoes Alcina Office na porta ${PORT}`))
