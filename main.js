const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')
const chokidar = require('chokidar')

const SHARE_PORT = 3847
const sseClients = new Set()

const CLAUDE_PLANS_DIR = path.join(os.homedir(), '.claude', 'plans')  // source
const VIEWER_PLANS_DIR = path.join(__dirname, 'plans')                  // local archive
const SNAPSHOTS_DIR    = path.join(VIEWER_PLANS_DIR, '.snapshots')      // version history
const PROJECTS_DIR     = path.join(os.homedir(), '.claude', 'projects')
const LIVE_STATE_FILE  = path.join(__dirname, '.live-plans.json')
const PREFS_FILE       = path.join(__dirname, '.prefs.json')

let mainWindow
let planMetaCache = null

// Plans marked live (persisted to .live-plans.json so restarts don't forget)
const livePlans = new Set()
// Plans currently being saved from the viewer (suppress chokidar loop)
const savingFromViewer = new Set()

// ── Live state persistence ────────────────────────────────────────────────────

function loadLiveState() {
  try {
    if (fs.existsSync(LIVE_STATE_FILE)) {
      JSON.parse(fs.readFileSync(LIVE_STATE_FILE, 'utf8')).forEach(f => livePlans.add(f))
    }
  } catch (_) {}
}

function saveLiveState() {
  fs.writeFileSync(LIVE_STATE_FILE, JSON.stringify([...livePlans], null, 2), 'utf8')
}

function updateDockBadge() {
  const n = livePlans.size
  if (app.dock) app.dock.setBadge(n > 0 ? String(n) : '')
}

// ── Sharing helpers ───────────────────────────────────────────────────────────

function getLocalIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}

function broadcastSSE(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`
  for (const client of [...sseClients]) {
    try { client.write(msg) } catch (_) { sseClients.delete(client) }
  }
}

function serveFile(res, filepath, contentType) {
  if (!fs.existsSync(filepath)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'Content-Type': contentType })
  fs.createReadStream(filepath).pipe(res)
}

function startSharingServer() {
  const RENDERER = path.join(__dirname, 'renderer')

  const staticMap = {
    '/':              ['web.html',      'text/html; charset=utf-8'],
    '/styles.css':    ['styles.css',    'text/css'],
    '/marked.min.js': ['marked.min.js', 'text/javascript'],
    '/renderer.js':   ['renderer.js',   'text/javascript'],
    '/web-api.js':    ['web-api.js',    'text/javascript'],
  }

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    const url      = new URL(req.url, 'http://localhost')
    const pathname = url.pathname

    // ── Static files ──
    if (staticMap[pathname]) {
      const [file, mime] = staticMap[pathname]
      serveFile(res, path.join(RENDERER, file), mime)
      return
    }

    // ── SSE ──
    if (pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      })
      res.write(': connected\n\n')
      sseClients.add(res)
      req.on('close', () => sseClients.delete(res))
      return
    }

    // ── Plans list ──
    if (pathname === '/api/plans' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(getPlans()))
      return
    }

    // ── Plan content ──
    const planMatch = pathname.match(/^\/api\/plans\/([^/]+)$/)
    if (planMatch && req.method === 'GET') {
      const filename = decodeURIComponent(planMatch[1])
      serveFile(res, path.join(VIEWER_PLANS_DIR, filename), 'text/plain; charset=utf-8')
      return
    }

    // ── Comments GET / POST ──
    const commentsMatch = pathname.match(/^\/api\/plans\/([^/]+)\/comments$/)
    if (commentsMatch) {
      const filename  = decodeURIComponent(commentsMatch[1])
      const cfilepath = path.join(VIEWER_PLANS_DIR, filename.replace('.md', '.comments.json'))

      if (req.method === 'GET') {
        if (!fs.existsSync(cfilepath)) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('[]')
        } else {
          serveFile(res, cfilepath, 'application/json')
        }
        return
      }

      if (req.method === 'POST') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const comments = JSON.parse(body)
            fs.writeFileSync(cfilepath, JSON.stringify(comments, null, 2), 'utf8')
            broadcastSSE({ comments: filename })
            mainWindow?.webContents.send('plan:updated', { comments: filename })
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end('{"ok":true}')
          } catch (_) { res.writeHead(400); res.end() }
        })
        return
      }
    }

    // ── Snapshots list ──
    const snapshotsMatch = pathname.match(/^\/api\/snapshots\/([^/]+)$/)
    if (snapshotsMatch && req.method === 'GET') {
      const filename = decodeURIComponent(snapshotsMatch[1])
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(getSnapshotTimestamps(filename)))
      return
    }

    // ── Plan references ──
    const refsMatch = pathname.match(/^\/api\/plans\/([^/]+)\/references$/)
    if (refsMatch && req.method === 'GET') {
      const filename = decodeURIComponent(refsMatch[1])
      const refPath = url.searchParams.get('path')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(refPath
        ? getReferencedFile(filename, refPath)
        : extractPlanReferences(filename)
      ))
      return
    }

    // ── Snapshot content ──
    const snapContentMatch = pathname.match(/^\/api\/snapshots\/([^/]+)\/(\d+)$/)
    if (snapContentMatch && req.method === 'GET') {
      const filename = decodeURIComponent(snapContentMatch[1])
      const ts       = snapContentMatch[2]
      serveFile(res, path.join(SNAPSHOTS_DIR, filename.replace('.md', ''), `${ts}.md`), 'text/plain; charset=utf-8')
      return
    }

    res.writeHead(404)
    res.end()
  })

  server.listen(SHARE_PORT, '0.0.0.0', () => {
    console.log(`Plan Viewer sharing: http://${getLocalIp()}:${SHARE_PORT}`)
  })
}

// ── Snapshot helpers ──────────────────────────────────────────────────────────

function saveSnapshot(filename, content) {
  const dir = path.join(SNAPSHOTS_DIR, filename.replace('.md', ''))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${Date.now()}.md`), content, 'utf8')
}

function getSnapshotTimestamps(filename) {
  const dir = path.join(SNAPSHOTS_DIR, filename.replace('.md', ''))
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => parseInt(f))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b)
}

// ── Plan sync ─────────────────────────────────────────────────────────────────

function syncPlans() {
  if (!fs.existsSync(CLAUDE_PLANS_DIR)) return
  for (const file of fs.readdirSync(CLAUDE_PLANS_DIR)) {
    if (!file.endsWith('.md')) continue
    const src  = path.join(CLAUDE_PLANS_DIR, file)
    const dest = path.join(VIEWER_PLANS_DIR, file)
    try {
      if (!fs.existsSync(dest) || fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs) {
        fs.copyFileSync(src, dest)
      }
    } catch (_) {}
  }
}

// ── Title / repo helpers ──────────────────────────────────────────────────────

function extractTitle(content, filename) {
  const match = content.match(/^# (.+)$/m)
  if (match) return match[1].trim()
  return path.basename(filename, '.md')
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function decodeProjectFolder(folder) {
  const parts = folder.replace(/^-/, '').split('-')
  const ghIdx = parts.indexOf('github')
  if (ghIdx >= 0 && parts[ghIdx + 1] === 'com' && parts[ghIdx + 2]) {
    const org  = parts[ghIdx + 2]
    const repo = parts.slice(ghIdx + 3).join('-')
    return repo ? `${org}/${repo}` : org
  }
  return parts[parts.length - 1] || 'Local'
}

function extractTrigger(lines, stem) {
  // Find the first line where this plan stem appears
  let firstIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(stem)) { firstIdx = i; break }
  }
  if (firstIdx === -1) return null

  // Walk backwards for the nearest user message with real content
  for (let i = firstIdx; i >= 0; i--) {
    let entry
    try { entry = JSON.parse(lines[i]) } catch (_) { continue }
    if (entry.type !== 'user') continue

    const mc = entry.message?.content
    let raw = ''
    if (typeof mc === 'string') raw = mc
    else if (Array.isArray(mc)) {
      for (const b of mc) {
        if (b.type === 'text' && b.text) { raw = b.text; break }
      }
    }

    // Strip injected XML blocks (<system-reminder>, etc.)
    const cleaned = raw.replace(/<\w[^>]*>[\s\S]*?<\/\w+>/g, '').trim()
    if (cleaned.length > 15) return cleaned
  }
  return null
}

function extractProjectRoot(lines) {
  for (const line of lines) {
    let entry
    try { entry = JSON.parse(line) } catch (_) { continue }
    if (entry.cwd && typeof entry.cwd === 'string' && fs.existsSync(entry.cwd)) {
      try {
        if (fs.statSync(entry.cwd).isDirectory()) return entry.cwd
      } catch (_) {}
    }
  }
  return null
}

function buildPlanMeta(planFilenames) {
  const repoMap    = {}
  const triggerMap = {}
  const rootMap    = {}
  if (!fs.existsSync(PROJECTS_DIR)) return { repoMap, triggerMap, rootMap }

  const planStems = planFilenames.map(f => f.replace('.md', ''))
  const matches   = []

  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    const projPath = path.join(PROJECTS_DIR, proj)
    try { if (!fs.statSync(projPath).isDirectory()) continue } catch (_) { continue }
    for (const fname of fs.readdirSync(projPath)) {
      if (!fname.endsWith('.jsonl')) continue
      try {
        const raw       = fs.readFileSync(path.join(projPath, fname), 'utf8')
        const mentioned = planStems.filter(s => raw.includes(s))
        if (!mentioned.length) continue
        const lines = raw.split('\n').filter(l => l.trim())
        matches.push({ proj, mentioned, lines })
      } catch (_) {}
    }
  }

  for (const stem of planStems) {
    const candidates = matches
      .filter(m => m.mentioned.includes(stem))
      .sort((a, b) => a.mentioned.length - b.mentioned.length)

    repoMap[stem + '.md'] = candidates.length
      ? decodeProjectFolder(candidates[0].proj)
      : 'Uncategorized'

    if (candidates.length) {
      triggerMap[stem + '.md'] = extractTrigger(candidates[0].lines, stem)
      rootMap[stem + '.md']    = extractProjectRoot(candidates[0].lines)
    }
  }

  return { repoMap, triggerMap, rootMap }
}

function getPlanContent(filename) {
  const filepath = path.join(VIEWER_PLANS_DIR, filename)
  if (!fs.existsSync(filepath)) return null
  return fs.readFileSync(filepath, 'utf8')
}

function extractPlanReferences(filename) {
  const content = getPlanContent(filename)
  if (!content) return []
  if (!planMetaCache) {
    const files = fs.readdirSync(VIEWER_PLANS_DIR).filter(f => f.endsWith('.md'))
    planMetaCache = buildPlanMeta(files)
  }

  const root = planMetaCache.rootMap?.[filename] || null
  const found = new Map()
  const patterns = [
    /`([^`\n]+\.(?:js|jsx|ts|tsx|css|html|json|md|mjs|cjs))`/g,
    /(?:File|Path|Modified|New|Update|Create):\s*`?([^`\n|]+?\.(?:js|jsx|ts|tsx|css|html|json|md|mjs|cjs))`?/gi,
    /(?:^|\s)([A-Za-z0-9_./~-]+\/[A-Za-z0-9_./~-]+\.(?:js|jsx|ts|tsx|css|html|json|md|mjs|cjs))/gm,
  ]

  for (const re of patterns) {
    let match
    while ((match = re.exec(content))) {
      const raw = (match[1] || '').trim().replace(/[),.;:]+$/g, '')
      if (!raw || raw.includes('://') || raw.length > 240) continue
      if (raw.startsWith('~/.')) continue
      const key = raw.replace(/^\.\//, '')
      if (found.has(key)) continue
      const resolved = resolveReferencePath(root, key)
      found.set(key, {
        path: key,
        exists: !!resolved,
        root,
        size: resolved ? fs.statSync(resolved).size : null,
      })
    }
  }

  return [...found.values()].slice(0, 30)
}

function resolveReferencePath(root, refPath) {
  if (!root || !refPath) return null
  const candidate = path.resolve(root, refPath)
  const normalizedRoot = path.resolve(root)
  if (candidate !== normalizedRoot && !candidate.startsWith(normalizedRoot + path.sep)) return null
  try {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null
    return candidate
  } catch (_) {
    return null
  }
}

function getReferencedFile(filename, refPath) {
  if (!planMetaCache) {
    const files = fs.readdirSync(VIEWER_PLANS_DIR).filter(f => f.endsWith('.md'))
    planMetaCache = buildPlanMeta(files)
  }
  const root = planMetaCache.rootMap?.[filename] || null
  const resolved = resolveReferencePath(root, refPath)
  if (!resolved) return null
  try {
    const stat = fs.statSync(resolved)
    if (stat.size > 250000) return { path: refPath, root, truncated: true, content: '' }
    return { path: refPath, root, truncated: false, content: fs.readFileSync(resolved, 'utf8') }
  } catch (_) {
    return null
  }
}

// ── Plans API ─────────────────────────────────────────────────────────────────

function getPlans() {
  if (!fs.existsSync(VIEWER_PLANS_DIR)) return []
  const files = fs.readdirSync(VIEWER_PLANS_DIR).filter(f => f.endsWith('.md'))
  if (!planMetaCache) planMetaCache = buildPlanMeta(files)

  return files
    .map(filename => {
      const filepath = path.join(VIEWER_PLANS_DIR, filename)
      const stat     = fs.statSync(filepath)
      const content  = fs.readFileSync(filepath, 'utf8')
      return {
        filename,
        title:        extractTitle(content, filename),
        modified:     stat.mtime.toISOString(),
        size:         stat.size,
        repo:         planMetaCache.repoMap[filename]    || 'Uncategorized',
        trigger:      planMetaCache.triggerMap[filename] || null,
        live:         livePlans.has(filename),
        versionCount: getSnapshotTimestamps(filename).length,
        summary:      content
          .replace(/^#.+$/gm, '')
          .replace(/[*_`>#\[\]()]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 500),
      }
    })
    .sort((a, b) => new Date(b.modified) - new Date(a.modified))
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 700,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  if (fs.existsSync(CLAUDE_PLANS_DIR)) {
    const watcher = chokidar.watch(CLAUDE_PLANS_DIR, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    })

    watcher.on('add', filepath => {
      const filename = path.basename(filepath)
      try { fs.copyFileSync(filepath, path.join(VIEWER_PLANS_DIR, filename)) } catch (_) {}
      livePlans.add(filename)
      saveLiveState()
      updateDockBadge()
      planMetaCache = null
      mainWindow?.webContents.send('plan:updated', { live: filename })
      broadcastSSE({ live: filename })
    })

    watcher.on('change', filepath => {
      const filename = path.basename(filepath)
      if (savingFromViewer.has(filename)) return
      const localPath = path.join(VIEWER_PLANS_DIR, filename)
      // Snapshot the current version before overwriting
      if (fs.existsSync(localPath)) {
        try {
          const oldContent = fs.readFileSync(localPath, 'utf8')
          const newContent = fs.readFileSync(filepath, 'utf8')
          if (oldContent !== newContent) saveSnapshot(filename, oldContent)
        } catch (_) {}
      }
      try { fs.copyFileSync(filepath, localPath) } catch (_) {}
      livePlans.add(filename)
      saveLiveState()
      updateDockBadge()
      mainWindow?.webContents.send('plan:updated', { live: filename })
      broadcastSSE({ live: filename })
    })
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('get-plans', () => getPlans())

ipcMain.handle('get-plan-content', (_, filename) => {
  return getPlanContent(filename)
})

ipcMain.handle('save-plan', (_, filename, content) => {
  savingFromViewer.add(filename)
  try {
    // Write to local archive
    fs.writeFileSync(path.join(VIEWER_PLANS_DIR, filename), content, 'utf8')
    // Also write back to Claude's directory so Claude reads the edited version
    const claudePath = path.join(CLAUDE_PLANS_DIR, filename)
    if (fs.existsSync(claudePath)) fs.writeFileSync(claudePath, content, 'utf8')
  } finally {
    setTimeout(() => savingFromViewer.delete(filename), 2000)
  }
  return true
})

ipcMain.handle('dismiss-live', (_, filename) => {
  livePlans.delete(filename)
  saveLiveState()
  updateDockBadge()
  return true
})

ipcMain.handle('load-comments', (_, filename) => {
  const filepath = path.join(VIEWER_PLANS_DIR, filename.replace('.md', '.comments.json'))
  if (!fs.existsSync(filepath)) return []
  try { return JSON.parse(fs.readFileSync(filepath, 'utf8')) } catch { return [] }
})

ipcMain.handle('save-comments', (_, filename, comments) => {
  fs.writeFileSync(
    path.join(VIEWER_PLANS_DIR, filename.replace('.md', '.comments.json')),
    JSON.stringify(comments, null, 2),
    'utf8'
  )
  return true
})

ipcMain.handle('get-last-plan', () => {
  try {
    if (fs.existsSync(PREFS_FILE))
      return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')).lastPlan || null
  } catch (_) {}
  return null
})

ipcMain.handle('set-last-plan', (_, filename) => {
  try {
    const prefs = fs.existsSync(PREFS_FILE)
      ? JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'))
      : {}
    prefs.lastPlan = filename
    fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2), 'utf8')
  } catch (_) {}
  return true
})

ipcMain.handle('get-prefs', () => {
  try {
    if (fs.existsSync(PREFS_FILE)) return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'))
  } catch (_) {}
  return {}
})

ipcMain.handle('set-prefs', (_, nextPrefs) => {
  try {
    const prefs = fs.existsSync(PREFS_FILE)
      ? JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'))
      : {}
    fs.writeFileSync(PREFS_FILE, JSON.stringify({ ...prefs, ...nextPrefs }, null, 2), 'utf8')
  } catch (_) {}
  return true
})

ipcMain.handle('get-snapshots', (_, filename) => getSnapshotTimestamps(filename))

ipcMain.handle('get-sharing-info', () => ({
  url:  `http://${getLocalIp()}:${SHARE_PORT}`,
  port: SHARE_PORT,
}))

ipcMain.handle('get-snapshot-content', (_, filename, ts) => {
  const p = path.join(SNAPSHOTS_DIR, filename.replace('.md', ''), `${ts}.md`)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
})

ipcMain.handle('get-plan-references', (_, filename) => extractPlanReferences(filename))
ipcMain.handle('get-referenced-file', (_, filename, refPath) => getReferencedFile(filename, refPath))

// ── Boot ──────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  fs.mkdirSync(VIEWER_PLANS_DIR, { recursive: true })
  fs.mkdirSync(SNAPSHOTS_DIR,    { recursive: true })
  loadLiveState()
  syncPlans()   // copy any plans added while app was closed
  startSharingServer()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    syncPlans()
    createWindow()
  }
})
