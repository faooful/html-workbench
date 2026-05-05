const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')
const crypto = require('crypto')
const chokidar = require('chokidar')

const SHARE_PORT = 3847
const sseClients = new Set()
let sharingServerUrl = null
let sharingServerReady = false

const CLAUDE_PLANS_DIR = path.join(os.homedir(), '.claude', 'plans')  // source
const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions')
const VIEWER_PLANS_DIR = path.join(__dirname, 'plans')                  // local archive
const DESIGN_DOCS_DIR  = path.join(__dirname, 'design-docs')
const SNAPSHOTS_DIR    = path.join(VIEWER_PLANS_DIR, '.snapshots')      // version history
const PROJECTS_DIR     = path.join(os.homedir(), '.claude', 'projects')
const CLAUDE_TASKS_DIR  = path.join(os.homedir(), '.claude', 'tasks')
const LIVE_STATE_FILE  = path.join(__dirname, '.live-plans.json')
const PREFS_FILE       = path.join(__dirname, '.prefs.json')
const SOURCES_FILE     = path.join(VIEWER_PLANS_DIR, '.sources.json')
const DESIGN_SOURCES_FILE = path.join(__dirname, '.design-sources.json')
const CODEX_IMPORT_VERSION = 2

const DEFAULT_DESIGN_DOC = `---
version: alpha
name: Product Design Language
description: Local-first design system guidance for AI implementation agents.
colors:
  primary: "#5E6DD6"
  secondary: "#8B949E"
  tertiary: "#238636"
  neutral: "#17191F"
  surface: "#20232B"
  on-surface: "#F2F4F8"
  error: "#EF4444"
typography:
  headline-md:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: 650
    lineHeight: 1.12
  body-md:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
  label-sm:
    fontFamily: Geist Mono
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.12em
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 0 12px
    height: 32px
  document-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
---

# Product Design Language

## Purpose

This document teaches coding agents how to apply this product's design language consistently.

## Design Principles

- Keep the interface calm and useful before decorative.
- Prefer clear hierarchy, restrained borders, and readable density.
- Use status only when it helps the user decide what to do next.

## Visual Language

- Surfaces are light, quiet, and local-first.
- Typography should prioritize legibility over marketing polish.
- Controls should feel native to macOS without copying system UI exactly.

## Tokens

- Accent: blue for primary actions and active navigation.
- Success: green for completed or approved states.
- Warning: amber only for real blockers or missing guidance.
- Radius: small for controls, medium for panels, large only for app-level surfaces.

## Components And Patterns

### Document Surface

Use a focused markdown column with generous margins and minimal chrome.

States:
- Empty
- Editing
- Previewing
- Export-ready

Do:
- Keep the document readable without the side panels.
- Let secondary context live in the right panel.

Don't:
- Stack multiple page-wide banners.
- Repeat the same status in three places.

## Accessibility

- Every icon-only control needs an accessible label.
- Interactive rows need visible focus states.
- Do not rely on color alone for readiness or warnings.

## Agent Implementation Rules

- Before implementing UI, read this file and follow the component guidance.
- If a component or state is missing, ask for clarification instead of inventing a new pattern.
- Preserve spacing, typography, and interaction conventions already documented here.

## Implementation Checklist

- [ ] Product context is clear
- [ ] Tokens are documented
- [ ] Components include states
- [ ] Do/don't examples are present
- [ ] Accessibility expectations are explicit
- [ ] Agent rules are actionable
`

let mainWindow
let planMetaCache = null
let taskIndexCache = null
let projectMetaCache = null
let designDocsWatcher = null
let designDocsBroadcastTimer = null

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

function broadcastPlanUpdate(data = {}) {
  mainWindow?.webContents.send('plan:updated', data)
  broadcastSSE(data)
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
    '/__desktop-test':['index.html',    'text/html; charset=utf-8'],
    '/styles.css':    ['styles.css',    'text/css'],
    '/app.css':       ['app.css',       'text/css'],
    '/app.bundle.js': ['app.bundle.js', 'text/javascript'],
    '/marked.min.js': ['marked.min.js', 'text/javascript'],
    '/renderer.js':   ['renderer.js',   'text/javascript'],
    '/web-api.js':    ['web-api.js',    'text/javascript'],
    '/test-api.js':   ['test-api.js',   'text/javascript'],
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
      const cfilepath = sidecarPath(filename, '.comments.json')

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
            appendPlanTimelineEvent(filename, {
              type: 'annotated',
              summary: `${Array.isArray(comments) ? comments.length : 0} annotations saved from browser`,
              data: {
                annotationCount: Array.isArray(comments) ? comments.length : 0,
                source: 'browser',
              },
            })
            broadcastSSE({ comments: filename })
            mainWindow?.webContents.send('plan:updated', { comments: filename })
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end('{"ok":true}')
          } catch (_) { res.writeHead(400); res.end() }
        })
        return
      }
    }

    // ── Review decision GET / POST ──
    const reviewMatch = pathname.match(/^\/api\/plans\/([^/]+)\/review$/)
    if (reviewMatch) {
      const filename = decodeURIComponent(reviewMatch[1])

      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(loadPlanReview(filename) || null))
        return
      }

      if (req.method === 'POST') {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end('{"error":"Review decisions are host-only"}')
        return
      }
    }

    // ── Plan timeline ──
    const timelineMatch = pathname.match(/^\/api\/plans\/([^/]+)\/timeline$/)
    if (timelineMatch && req.method === 'GET') {
      const filename = decodeURIComponent(timelineMatch[1])
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(loadPlanTimeline(filename)))
      return
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

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      sharingServerReady = false
      sharingServerUrl = null
      console.warn(`Plan Viewer sharing unavailable: port ${SHARE_PORT} is already in use`)
      return
    }
    throw err
  })

  server.listen(SHARE_PORT, '0.0.0.0', () => {
    sharingServerReady = true
    sharingServerUrl = `http://${getLocalIp()}:${SHARE_PORT}`
    console.log(`Plan Viewer sharing: ${sharingServerUrl}`)
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
  syncClaudePlans()
  syncCodexPlans()
  ensurePlanTimelines()
}

function syncClaudePlans() {
  if (!fs.existsSync(CLAUDE_PLANS_DIR)) return []
  const synced = []
  for (const file of fs.readdirSync(CLAUDE_PLANS_DIR)) {
    if (!file.endsWith('.md')) continue
    const src  = path.join(CLAUDE_PLANS_DIR, file)
    const dest = path.join(VIEWER_PLANS_DIR, file)
    try {
      if (!fs.existsSync(dest) || fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs) {
        const existed = fs.existsSync(dest)
        fs.copyFileSync(src, dest)
        appendPlanTimelineEvent(file, {
          type: existed ? 'revised' : 'created',
          summary: existed ? 'Claude plan content changed' : 'Claude plan imported',
          data: { source: 'claude', sourcePath: src },
        })
        synced.push(file)
      }
    } catch (_) {}
  }
  const sources = loadSourceMeta()
  for (const file of synced) {
    sources[file] = {
      source: 'claude',
      sourcePath: path.join(CLAUDE_PLANS_DIR, file),
      sourceId: file,
      createdAt: sources[file]?.createdAt || new Date().toISOString(),
    }
  }
  saveSourceMeta(sources)
  return synced
}

function ensurePlanTimelines() {
  if (!fs.existsSync(VIEWER_PLANS_DIR)) return
  const sources = loadSourceMeta()
  for (const filename of fs.readdirSync(VIEWER_PLANS_DIR)) {
    if (!filename.endsWith('.md')) continue
    if (loadPlanTimeline(filename).length) continue

    const filepath = path.join(VIEWER_PLANS_DIR, filename)
    let stat
    try { stat = fs.statSync(filepath) } catch (_) { continue }
    const source = sources[filename]
    const sourceName = source?.source || 'archive'
    appendPlanTimelineEvent(filename, {
      type: 'created',
      at: source?.createdAt || stat.birthtime?.toISOString?.() || stat.mtime.toISOString(),
      summary: sourceName === 'archive' ? 'Plan added to local archive' : `${capitalize(sourceName)} plan imported`,
      data: {
        source: sourceName,
        sourcePath: source?.sourcePath || null,
        backfilled: true,
      },
    })
  }
}

function capitalize(value) {
  const text = String(value || '')
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

function syncCodexPlans(sessionPath = null) {
  if (!fs.existsSync(CODEX_SESSIONS_DIR)) return []
  const sources = loadSourceMeta()
  const imported = []
  const sessionPaths = sessionPath
    ? [sessionPath]
    : walkFiles(CODEX_SESSIONS_DIR, f => f.endsWith('.jsonl'))

  for (const currentSessionPath of sessionPaths) {
    imported.push(...syncCodexSessionPlans(currentSessionPath, sources))
  }

  if (sessionPaths.length) saveSourceMeta(sources)
  return imported
}

function syncCodexSessionPlans(sessionPath, sources) {
  if (!sessionPath.endsWith('.jsonl') || !fs.existsSync(sessionPath)) return []

  let stat
  try { stat = fs.statSync(sessionPath) } catch (_) { return [] }

  const sessionKey = codexSessionCacheKey(sessionPath)
  const cached = sources[sessionKey]
  if (cached?.size === stat.size && cached?.mtimeMs === stat.mtimeMs && cached?.importVersion === CODEX_IMPORT_VERSION) return []

  const imported = []
  for (const plan of extractCodexPlans(sessionPath)) {
    const filename = codexPlanFilename(plan.sourceId, plan.content)
    const dest = path.join(VIEWER_PLANS_DIR, filename)
    const markdown = codexPlanMarkdown(plan)
    try {
      if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== markdown) {
        if (fs.existsSync(dest)) {
          saveSnapshot(filename, fs.readFileSync(dest, 'utf8'))
          appendPlanTimelineEvent(filename, {
            type: 'revised',
            summary: 'Codex plan content changed',
            data: { source: 'codex', sourcePath: sessionPath },
          })
        } else {
          appendPlanTimelineEvent(filename, {
            type: 'created',
            at: plan.createdAt,
            summary: 'Codex plan imported',
            data: { source: 'codex', sourcePath: sessionPath, repo: plan.repo || null },
          })
        }
        fs.writeFileSync(dest, markdown, 'utf8')
        imported.push(filename)
      }
      sources[filename] = {
        source: 'codex',
        sourcePath: sessionPath,
        sourceId: plan.sourceId,
        cwd: plan.cwd || null,
        repo: plan.repo || null,
        title: plan.title || null,
        createdAt: sources[filename]?.createdAt || plan.createdAt,
      }
    } catch (_) {}
  }

  sources[sessionKey] = {
    source: 'codex-session',
    sourcePath: sessionPath,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    importVersion: CODEX_IMPORT_VERSION,
    checkedAt: new Date().toISOString(),
  }
  return imported
}

function codexSessionCacheKey(sessionPath) {
  return `__codexSession:${sessionPath}`
}

function loadSourceMeta() {
  try {
    if (fs.existsSync(SOURCES_FILE)) return JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8'))
  } catch (_) {}
  return {}
}

function saveSourceMeta(sources) {
  try {
    fs.writeFileSync(SOURCES_FILE, JSON.stringify(sources, null, 2), 'utf8')
  } catch (_) {}
}

function walkFiles(root, filter) {
  const out = []
  const stack = [root]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch (_) { continue }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (!filter || filter(full)) out.push(full)
    }
  }
  return out
}

function extractCodexPlans(sessionPath) {
  const plans = []
  let sessionId = path.basename(sessionPath, '.jsonl')
  let cwd = null
  let repo = null
  let latestUserPrompt = ''
  let planIndex = 0
  try {
    const lines = fs.readFileSync(sessionPath, 'utf8').split('\n').filter(Boolean)
    for (const line of lines) {
      let entry
      try { entry = JSON.parse(line) } catch (_) { continue }
      const meta = entry.payload
      if (entry.type === 'session_meta' && meta) {
        sessionId = meta.id || sessionId
        cwd = meta.cwd || cwd
        repo = repoFromGitUrl(meta.git?.repository_url) || repoFromPath(cwd) || repo
      }
      if (entry.type === 'turn_context' && meta) {
        cwd = meta.cwd || cwd
        repo = repoFromPath(cwd) || repo
      }
      if (entry.type === 'response_item' && entry.payload?.type === 'message' && entry.payload?.role === 'user') {
        latestUserPrompt = collectMessageText(entry.payload.content) || latestUserPrompt
      }
      if (entry.type === 'event_msg' && meta?.type === 'user_message') {
        latestUserPrompt = meta.message || latestUserPrompt
      }
      if (entry.type !== 'response_item' || entry.payload?.type !== 'message' || entry.payload?.role !== 'assistant') {
        continue
      }
      for (const text of collectText(entry.payload.content)) {
        const re = /<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/g
        let match
        while ((match = re.exec(text))) {
          const content = match[1].trim()
          if (!content) continue
          const sourceId = `${sessionId}:${planIndex++}:${hashText(content).slice(0, 12)}`
          plans.push({
            content,
            title: extractCodexPlanTitle(content, latestUserPrompt),
            sourceId,
            sourcePath: sessionPath,
            createdAt: entry.timestamp || new Date().toISOString(),
            cwd,
            repo: repo || repoFromPath(cwd) || 'Codex',
          })
        }
      }
    }
  } catch (_) {}
  return plans
}

function collectText(value, out = []) {
  if (!value) return out
  if (typeof value === 'string') {
    if (value.includes('<proposed_plan>')) out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    value.forEach(v => collectText(v, out))
    return out
  }
  if (typeof value === 'object') {
    Object.values(value).forEach(v => collectText(v, out))
  }
  return out
}

function codexPlanFilename(sourceId, content) {
  return `codex-${hashText(`${sourceId}\n${content}`).slice(0, 16)}.md`
}

function codexPlanMarkdown(plan) {
  const title = plan.title || extractCodexPlanTitle(plan.content)
  const meta = [
    `Source: Codex`,
    plan.repo ? `Repo: ${plan.repo}` : null,
    plan.cwd ? `Cwd: ${plan.cwd}` : null,
    `Created: ${plan.createdAt}`,
    `Source ID: ${plan.sourceId}`,
  ].filter(Boolean).join('\n')
  return `# ${title}\n\n<!-- plan-viewer-source\n${meta}\n-->\n\n${stripCodexPlanTitle(plan.content).trim()}\n`
}

function extractCodexPlanTitle(content, fallbackText = '') {
  const text = String(content || '').trim()
  const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (heading) return cleanTitle(heading)

  const labelled = text.match(/^\s*(?:\*\*)?title(?:\*\*)?\s*:\s*(?:\*\*)?(.+?)(?:\*\*)?\s*$/im)?.[1]?.trim()
  if (labelled) return cleanTitle(labelled)

  const firstBold = text.match(/^\s*\*\*(.{8,120}?)\*\*\s*$/m)?.[1]?.trim()
  if (firstBold && !/^(summary|test plan|assumptions|key changes)$/i.test(firstBold)) return cleanTitle(firstBold)

  const firstSection = text.match(/^##+\s+(.+)$/m)?.[1]?.trim()
  if (firstSection && !isGenericPlanSection(firstSection)) return cleanTitle(firstSection)

  const promptTitle = titleFromPrompt(fallbackText)
  if (promptTitle) return promptTitle

  const firstLine = text.split('\n').map(line => line.trim()).find(line =>
    line.length >= 8 && line.length <= 120 && !line.startsWith('-') && !line.startsWith('```') && !isGenericPlanSection(line)
  )
  return firstLine ? cleanTitle(firstLine) : 'Codex Plan'
}

function isGenericPlanSection(title) {
  return /^(summary|context|findings|key changes|implementation|test plan|assumptions|scope|overview)$/i.test(String(title || '').trim())
}

function titleFromPrompt(prompt) {
  const text = String(prompt || '')
    .replace(/<\w[^>]*>[\s\S]*?<\/\w+>/g, '')
    .replace(/^please implement this plan:\s*/i, '')
    .trim()
  const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (heading) return cleanTitle(heading)
  const firstLine = text.split('\n').map(line => line.trim()).find(line =>
    line.length >= 8 && line.length <= 120 && !line.startsWith('![') && !line.startsWith('<image')
  )
  return firstLine ? cleanTitle(firstLine) : null
}

function collectMessageText(value) {
  const parts = []
  collectAllText(value, parts)
  return parts.join('\n').trim()
}

function collectAllText(value, out) {
  if (!value) return
  if (typeof value === 'string') {
    out.push(value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach(v => collectAllText(v, out))
    return
  }
  if (typeof value === 'object') {
    if (typeof value.text === 'string') out.push(value.text)
    else if (typeof value.message === 'string') out.push(value.message)
    else Object.values(value).forEach(v => collectAllText(v, out))
  }
}

function cleanTitle(title) {
  return String(title || '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\*\*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Codex Plan'
}

function stripCodexPlanTitle(content) {
  return String(content || '')
    .replace(/^#\s+.+\n?/, '')
    .replace(/^\s*(?:\*\*)?title(?:\*\*)?\s*:\s*(?:\*\*)?.+?(?:\*\*)?\s*\n+/i, '')
}

function hashText(text) {
  return crypto.createHash('sha1').update(text).digest('hex')
}

function repoFromGitUrl(url) {
  const match = String(url || '').match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)
  return match ? match[1] : null
}

function repoFromPath(dir) {
  if (!dir) return null
  const parts = path.resolve(dir).split(path.sep).filter(Boolean)
  const githubIdx = parts.indexOf('github.com')
  if (githubIdx >= 0 && parts[githubIdx + 1] && parts[githubIdx + 2]) {
    return `${parts[githubIdx + 1]}/${parts[githubIdx + 2]}`
  }
  return parts[parts.length - 1] || null
}

// ── Title / repo helpers ──────────────────────────────────────────────────────

function titleCaseSegment(input) {
  return String(input || 'design')
    .replace(/\.[^.]+$/, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Design'
}

function extractDesignName(content) {
  const frontMatter = extractDesignFrontMatter(content)
  const match = frontMatter.match(/^\s*name:\s*["']?(.+?)["']?\s*$/m)
  return match ? match[1].trim() : null
}

function titleFromDesignPath(filename) {
  const parts = String(filename || '').split(/[\\/]+/).filter(Boolean)
  const base = parts[parts.length - 1] || 'design.md'
  if (/^design\.md$/i.test(base) && parts.length > 1) {
    return `${titleCaseSegment(parts[parts.length - 2])} Design`
  }
  return titleCaseSegment(base)
}

function extractTitle(content, filename) {
  const frontMatterName = extractDesignName(content)
  if (frontMatterName) return frontMatterName
  const match = content.match(/^# (.+)$/m)
  if (match) return match[1].trim()
  return titleFromDesignPath(filename)
}

function designSlug(input) {
  return String(input || 'design')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'design'
}

function designDocPath(filename) {
  const clean = String(filename || '').replace(/^\/+/, '')
  return path.resolve(DESIGN_DOCS_DIR, clean)
}

function safeJsonRead(filepath, fallback) {
  try {
    if (!fs.existsSync(filepath)) return fallback
    return JSON.parse(fs.readFileSync(filepath, 'utf8'))
  } catch (_) {
    return fallback
  }
}

function sourceIdForPath(folderPath) {
  return crypto.createHash('sha1').update(path.resolve(folderPath)).digest('hex').slice(0, 10)
}

function inferLinkedDesignSourceName(folderPath) {
  const resolved = path.resolve(folderPath)
  const base = path.basename(resolved)
  const parent = path.basename(path.dirname(resolved))
  return /^designs?$/i.test(base) && parent ? parent : base || 'linked-design'
}

function loadDesignSources() {
  const raw = safeJsonRead(DESIGN_SOURCES_FILE, [])
  return Array.isArray(raw)
    ? raw
        .filter(source => source?.path)
        .map(source => ({
          id: source.id || sourceIdForPath(source.path),
          name: source.name || inferLinkedDesignSourceName(source.path),
          path: path.resolve(source.path),
          createdAt: source.createdAt || new Date().toISOString(),
        }))
    : []
}

function saveDesignSources(sources) {
  fs.writeFileSync(DESIGN_SOURCES_FILE, JSON.stringify(sources, null, 2), 'utf8')
}

function linkedDesignFilename(source, rel) {
  return path.join('linked', source.id, rel)
}

function isLinkedDesignFilename(filename) {
  return String(filename || '').replace(/\\/g, '/').startsWith('linked/')
}

function resolveLinkedDesignDoc(filename) {
  const clean = String(filename || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = clean.split('/').filter(Boolean)
  if (parts[0] !== 'linked' || !parts[1] || parts.length < 3) return null
  const source = loadDesignSources().find(item => item.id === parts[1])
  if (!source) return null
  const rel = parts.slice(2).join('/')
  const root = path.resolve(source.path)
  const filepath = path.resolve(root, rel)
  if (filepath !== root && !filepath.startsWith(root + path.sep)) return null
  return { filepath, root, rel, source, linked: true }
}

function resolveDesignDoc(filename) {
  if (isLinkedDesignFilename(filename)) return resolveLinkedDesignDoc(filename)
  const filepath = designDocPath(filename)
  const root = path.resolve(DESIGN_DOCS_DIR)
  if (filepath !== root && !filepath.startsWith(root + path.sep)) return null
  return {
    filepath,
    root,
    rel: path.relative(root, filepath),
    source: { id: 'local', name: 'local', path: root },
    linked: false,
  }
}

function sanitizeDesignPathSegment(segment, fallback = 'design') {
  const clean = String(segment || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/[^a-zA-Z0-9._ -]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!clean || clean === '.' || clean === '..') return fallback
  return clean
}

function normalizeDesignDocFilename(project = 'local', input = 'DESIGN.md') {
  const hasPathIntent = /[\\/]/.test(String(input || '')) || /\.md$/i.test(String(input || ''))
  let raw
  if (hasPathIntent) {
    const inputPath = String(input || 'DESIGN.md').trim().replace(/\\/g, '/').replace(/^\/+/, '')
    const projectPrefix = String(project || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    raw = projectPrefix && !inputPath.startsWith(`${projectPrefix}/`) ? `${projectPrefix}/${inputPath}` : inputPath
  } else {
    raw = `${designSlug(project || 'local')}/${designSlug(input || 'design')}.md`
  }

  const parts = raw
    .split('/')
    .filter(Boolean)
    .filter(part => part !== '.' && part !== '..')
    .map((part, index, all) => {
      const isFile = index === all.length - 1
      if (isFile && /\.md$/i.test(part)) {
        const stem = sanitizeDesignPathSegment(part.replace(/\.md$/i, ''), 'DESIGN')
        return `${stem}.md`
      }
      return sanitizeDesignPathSegment(part, 'design')
    })

  if (!parts.length) parts.push(designSlug(project || 'local'), 'DESIGN.md')
  if (!/\.md$/i.test(parts[parts.length - 1])) parts.push('DESIGN.md')
  return path.join(...parts)
}

function ensureDefaultDesignDoc() {
  fs.mkdirSync(DESIGN_DOCS_DIR, { recursive: true })
  const projectDir = path.join(DESIGN_DOCS_DIR, 'plan-viewer')
  const docPath = path.join(projectDir, 'design.md')
  if (fs.existsSync(docPath)) return
  fs.mkdirSync(projectDir, { recursive: true })
  fs.writeFileSync(docPath, DEFAULT_DESIGN_DOC, 'utf8')
  fs.writeFileSync(path.join(projectDir, 'design.meta.json'), JSON.stringify({
    project: 'plan-viewer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'starter',
  }, null, 2), 'utf8')
}

function extractDesignFrontMatter(content) {
  const match = String(content || '').match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
  return match ? match[1] : ''
}

function designReadiness(content) {
  const frontMatter = extractDesignFrontMatter(content)
  const hasFrontMatter = Boolean(frontMatter)
  const hasPrimary = /^\s*primary:\s*["']?#[0-9a-f]{3,8}/im.test(frontMatter)
  const hasTypography = /^\s*typography:\s*$/im.test(frontMatter)
  const hasComponents = /^\s*components:\s*$/im.test(frontMatter)
  const brokenRefs = [...frontMatter.matchAll(/\{([^}]+)\}/g)]
    .map(match => match[1])
    .filter(ref => !new RegExp(`^\\s*${ref.split('.')[1]}:\\s*`, 'im').test(frontMatter))
  const bodySections = [...String(content || '').matchAll(/^##\s+(.+)$/gm)].map(match => match[1].trim())
  const hasCanonicalSection = bodySections.some(section => /^(Overview|Brand & Style|Colors|Typography|Layout|Layout & Spacing|Components|Do's and Don'ts)$/i.test(section))
  const warnings = [
    !hasFrontMatter && 'Missing YAML front matter',
    hasFrontMatter && !hasPrimary && 'Missing colors.primary',
    hasFrontMatter && !hasTypography && 'Missing typography tokens',
    hasFrontMatter && !hasComponents && 'Missing component tokens',
    hasFrontMatter && !hasCanonicalSection && 'Missing canonical markdown sections',
    brokenRefs.length && `${brokenRefs.length} unresolved token reference${brokenRefs.length === 1 ? '' : 's'}`,
  ].filter(Boolean)

  let state = 'ready'
  if (!hasFrontMatter) state = 'needs_structure'
  else if (warnings.length) state = 'warnings'
  return {
    passed: warnings.length ? 0 : 1,
    total: 1,
    state,
    warnings,
    hasFrontMatter,
    hasComponents,
    brokenRefs,
  }
}

function buildDesignDocRecord({ rel, full, project, scope = '', linked = false, source = null }) {
  const stat = fs.statSync(full)
  const content = fs.readFileSync(full, 'utf8')
  const readiness = designReadiness(content)
  return {
    filename: linked ? linkedDesignFilename(source, rel) : rel,
    displayPath: rel,
    path: full,
    kind: 'design-doc',
    title: extractTitle(content, rel),
    repo: project,
    project,
    scope,
    modified: stat.mtime.toISOString(),
    created: stat.birthtime?.toISOString?.() || stat.mtime.toISOString(),
    live: false,
    source: linked ? 'linked-folder' : 'design-doc',
    sourceName: source?.name || project,
    sourceRoot: source?.path || DESIGN_DOCS_DIR,
    linked,
    status: readiness.state,
    readiness,
    versionCount: 0,
    trigger: null,
    summary: content
      .replace(/^#.+$/gm, '')
      .replace(/[*_`>#\[\]()]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 500),
  }
}

function getDesignDocs() {
  const docs = []
  const walk = (dir, prefix = '', options = {}) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory() && ['node_modules', 'dist', 'build', 'coverage'].includes(entry.name)) continue
      const rel = path.join(prefix, entry.name)
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, rel, options)
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        const pathParts = rel.split(path.sep).filter(Boolean)
        const project = options.project || pathParts[0] || 'Design docs'
        const scope = options.linked ? pathParts.slice(0, -1).join('/') : pathParts.slice(1, -1).join('/')
        docs.push(buildDesignDocRecord({
          rel,
          full,
          project,
          scope,
          linked: Boolean(options.linked),
          source: options.source || null,
        }))
      }
    }
  }
  walk(DESIGN_DOCS_DIR)
  for (const source of loadDesignSources()) {
    walk(source.path, '', { linked: true, source, project: source.name })
  }
  return docs.sort((a, b) => new Date(b.modified) - new Date(a.modified))
}

function getDesignDocPath(filename) {
  const resolved = resolveDesignDoc(filename)
  if (!resolved || !fs.existsSync(resolved.filepath)) return null
  return resolved.filepath
}

function revealDesignDoc(filename) {
  const filepath = getDesignDocPath(filename)
  if (!filepath) return false
  shell.showItemInFolder(filepath)
  return true
}

function getDesignDocContent(filename) {
  const resolved = resolveDesignDoc(filename)
  if (!resolved || !fs.existsSync(resolved.filepath)) return null
  return fs.readFileSync(resolved.filepath, 'utf8')
}

function saveDesignDoc(filename, content) {
  const resolved = resolveDesignDoc(filename || `local/${designSlug(extractTitle(content, 'design.md'))}.md`)
  if (!resolved) return null
  fs.mkdirSync(path.dirname(resolved.filepath), { recursive: true })
  fs.writeFileSync(resolved.filepath, content, 'utf8')
  scheduleDesignDocsBroadcast({ filename })
  return resolved.linked ? linkedDesignFilename(resolved.source, resolved.rel) : path.relative(DESIGN_DOCS_DIR, resolved.filepath)
}

function createDesignDoc(project = 'local', title = 'Untitled design') {
  let filename = normalizeDesignDocFilename(project, title || 'DESIGN.md')
  let filepath = designDocPath(filename)
  const root = path.resolve(DESIGN_DOCS_DIR) + path.sep
  if (!filepath.startsWith(root)) return null
  fs.mkdirSync(path.dirname(filepath), { recursive: true })

  let i = 2
  while (fs.existsSync(filepath)) {
    const parsed = path.parse(filename)
    filename = path.join(parsed.dir, `${parsed.name}-${i}${parsed.ext || '.md'}`)
    filepath = designDocPath(filename)
    i++
  }
  const displayTitle = titleFromDesignPath(filename)

  const content = `---
version: alpha
name: ${displayTitle}
description: Describe what this design system or feature should help an agent build.
colors:
  primary: "#5E6DD6"
  secondary: "#8B949E"
  neutral: "#17191F"
  surface: "#20232B"
  on-surface: "#F2F4F8"
typography:
  headline-md:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: 650
    lineHeight: 1.12
  body-md:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: 6px
  md: 10px
spacing:
  sm: 8px
  md: 16px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    height: 32px
---

# ${displayTitle}

## Overview

Describe what this design system or feature should help an agent build.

## Colors

Explain the palette roles and when to use each color.

## Typography

Explain the hierarchy, tone, and readability expectations.

## Layout

Explain spacing, density, and grid behavior.

## Components

### Button

Variants: Primary, Secondary, Ghost
Sizes: Small, Medium, Large
States: Default, Hover, Disabled

## Agent Implementation Rules

- Read this file before changing UI.
- Reuse documented tokens and component patterns.
`
  fs.writeFileSync(filepath, content, 'utf8')
  scheduleDesignDocsBroadcast({ filename })
  return path.relative(DESIGN_DOCS_DIR, filepath)
}

function renameDesignDoc(filename, nextFilename) {
  if (isLinkedDesignFilename(filename)) return null
  const from = designDocPath(filename)
  const to = designDocPath(normalizeDesignDocFilename('', nextFilename || 'DESIGN.md'))
  const root = path.resolve(DESIGN_DOCS_DIR) + path.sep
  if (!from.startsWith(root) || !to.startsWith(root) || !fs.existsSync(from)) return null
  if (fs.existsSync(to)) return null
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.renameSync(from, to)
  scheduleDesignDocsBroadcast({ filename: nextFilename })
  return path.relative(DESIGN_DOCS_DIR, to)
}

function deleteDesignDoc(filename) {
  if (isLinkedDesignFilename(filename)) return false
  const filepath = designDocPath(filename)
  if (!filepath.startsWith(path.resolve(DESIGN_DOCS_DIR) + path.sep) || !fs.existsSync(filepath)) return false
  fs.rmSync(filepath)
  scheduleDesignDocsBroadcast({ filename })
  return true
}

async function linkDesignFolder() {
  const result = await dialog.showOpenDialog({
    title: 'Link design folder',
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths?.[0]) return null
  const folderPath = path.resolve(result.filePaths[0])
  const existing = loadDesignSources()
  const id = sourceIdForPath(folderPath)
  const source = {
    id,
    name: inferLinkedDesignSourceName(folderPath),
    path: folderPath,
    createdAt: new Date().toISOString(),
  }
  const next = [source, ...existing.filter(item => item.id !== id)]
  saveDesignSources(next)
  startDesignDocsWatcher()
  broadcastDesignDocsUpdated({ source })
  return source
}

function getDesignSources() {
  return loadDesignSources()
}

function unlinkDesignFolder(sourceId) {
  const next = loadDesignSources().filter(source => source.id !== sourceId)
  saveDesignSources(next)
  startDesignDocsWatcher()
  broadcastDesignDocsUpdated({ sourceId })
  return true
}

function refreshDesignFolders() {
  startDesignDocsWatcher()
  broadcastDesignDocsUpdated({ refreshed: true })
  return getDesignDocs()
}

function broadcastDesignDocsUpdated(data = {}) {
  mainWindow?.webContents.send('design-docs:updated', data)
}

function scheduleDesignDocsBroadcast(data = {}) {
  clearTimeout(designDocsBroadcastTimer)
  designDocsBroadcastTimer = setTimeout(() => broadcastDesignDocsUpdated(data), 150)
}

function startDesignDocsWatcher() {
  if (designDocsWatcher) {
    designDocsWatcher.close().catch(() => {})
    designDocsWatcher = null
  }
  const watchPaths = [DESIGN_DOCS_DIR, ...loadDesignSources().map(source => source.path)].filter(filepath => fs.existsSync(filepath))
  if (!watchPaths.length) return
  designDocsWatcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    ignored: /(^|[/\\])(\.git|node_modules|dist|build|coverage)([/\\]|$)/,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
  })
  const onChange = filepath => {
    if (!String(filepath || '').endsWith('.md')) return
    scheduleDesignDocsBroadcast({ filepath })
  }
  designDocsWatcher.on('add', onChange)
  designDocsWatcher.on('change', onChange)
  designDocsWatcher.on('unlink', onChange)
}

async function lintDesignDoc(content) {
  try {
    const mod = await import('@google/design.md/linter')
    const report = mod.lint(String(content || ''))
    return {
      ok: true,
      summary: report.summary,
      findings: report.findings || [],
      tailwindConfig: report.tailwindConfig || null,
      dtcg: report.dtcg || null,
    }
  } catch (err) {
    return {
      ok: false,
      summary: { errors: 0, warnings: 1, infos: 0 },
      findings: [{ severity: 'warning', path: 'linter', message: err.message || 'DESIGN.md linter unavailable' }],
    }
  }
}

async function exportDesignDoc(content, format) {
  const report = await lintDesignDoc(content)
  if (!report.ok) return report
  if (format === 'tailwind') {
    if (!report.tailwindConfig?.success) {
      return { ok: false, message: report.tailwindConfig?.error || 'Tailwind export unavailable for this document.' }
    }
    return { ok: true, data: report.tailwindConfig.data }
  }
  if (format === 'dtcg') {
    if (!report.dtcg?.success) {
      return { ok: false, message: report.dtcg?.error || 'DTCG export unavailable for this document.' }
    }
    return { ok: true, data: report.dtcg.data }
  }
  return { ok: false, message: 'Unknown export format.' }
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
  const sourceMap  = {}
  const statusMap  = {}
  const sourceMeta = loadSourceMeta()
  const taskIndex  = loadClaudeTasks()

  for (const filename of planFilenames) {
    const content = getPlanContent(filename) || ''
    const embedded = extractEmbeddedPlanMeta(content)
    sourceMap[filename] = sourceMeta[filename]?.source || (filename.startsWith('codex-') ? 'codex' : 'archive')
    if (sourceMap[filename] === 'archive' && fs.existsSync(path.join(CLAUDE_PLANS_DIR, filename))) {
      sourceMap[filename] = 'claude'
    }
    const sourceEntry = sourceMeta[filename] || {}
    const codexRoot = sourceEntry.source === 'codex' && !embedded.cwd
      ? inferCodexSessionRoot(sourceEntry.sourcePath)
      : null
    if (embedded.repo || sourceEntry.repo) repoMap[filename] = embedded.repo || sourceEntry.repo
    if (embedded.cwd || sourceEntry.cwd || codexRoot) rootMap[filename] = embedded.cwd || sourceEntry.cwd || codexRoot
    statusMap[filename] = inferPlanStatus(filename, content, taskIndex)
  }

  const matches = getClaudeProjectMatches(planFilenames)
  if (!matches.length) return { repoMap, triggerMap, rootMap, sourceMap, statusMap }

  const planStems = planFilenames.map(f => f.replace('.md', ''))

  for (const stem of planStems) {
    const candidates = matches
      .filter(m => m.mentioned.includes(stem))
      .sort((a, b) => a.mentioned.length - b.mentioned.length)

    const filename = stem + '.md'
    repoMap[filename] = repoMap[filename] || (candidates.length
      ? decodeProjectFolder(candidates[0].proj)
      : 'Uncategorized')

    if (candidates.length) {
      triggerMap[filename] = extractTrigger(candidates[0].lines, stem)
      rootMap[filename]    = rootMap[filename] || extractProjectRoot(candidates[0].lines)
    }
  }

  return { repoMap, triggerMap, rootMap, sourceMap, statusMap }
}

function inferCodexSessionRoot(sessionPath) {
  if (!sessionPath || !fs.existsSync(sessionPath)) return null
  let cwd = null
  try {
    for (const line of fs.readFileSync(sessionPath, 'utf8').split('\n')) {
      if (!line.trim()) continue
      let entry
      try { entry = JSON.parse(line) } catch (_) { continue }
      const meta = entry.payload
      if ((entry.type === 'session_meta' || entry.type === 'turn_context') && meta?.cwd) {
        cwd = meta.cwd
      }
    }
  } catch (_) {}
  if (!cwd || !fs.existsSync(cwd)) return null
  try {
    return fs.statSync(cwd).isDirectory() ? cwd : null
  } catch (_) {
    return null
  }
}

function getClaudeProjectMatches(planFilenames) {
  if (!fs.existsSync(PROJECTS_DIR)) return []

  const planStems = planFilenames.map(f => f.replace('.md', '')).sort()
  const cacheKey = planStems.join('\n')
  if (projectMetaCache?.cacheKey === cacheKey) return projectMetaCache.matches

  const matches = []
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

  projectMetaCache = { cacheKey, matches }
  return matches
}

function extractEmbeddedPlanMeta(content) {
  const block = content.match(/<!-- plan-viewer-source\s*([\s\S]*?)\s*-->/)
  if (!block) return {}
  const meta = {}
  for (const line of block[1].split('\n')) {
    const [rawKey, ...rest] = line.split(':')
    const key = rawKey.trim().toLowerCase()
    const value = rest.join(':').trim()
    if (key === 'repo') meta.repo = value
    if (key === 'cwd' && value && fs.existsSync(value)) meta.cwd = value
  }
  return meta
}

function loadClaudeTasks() {
  if (taskIndexCache) return taskIndexCache
  const tasks = []
  if (!fs.existsSync(CLAUDE_TASKS_DIR)) {
    taskIndexCache = tasks
    return tasks
  }
  for (const file of walkFiles(CLAUDE_TASKS_DIR, f => f.endsWith('.json'))) {
    try {
      const task = JSON.parse(fs.readFileSync(file, 'utf8'))
      const subject = String(task.subject || '').trim()
      const description = String(task.description || '').trim()
      const haystack = `${subject}\n${description}`.toLowerCase()
      if (!subject && !description) continue
      tasks.push({
        subject,
        description,
        haystack,
        status: String(task.status || '').toLowerCase(),
      })
    } catch (_) {}
  }
  taskIndexCache = tasks
  return tasks
}

function inferPlanStatus(filename, content, tasks) {
  if (livePlans.has(filename)) return 'needs_review'
  const normalized = `${extractTitle(content, filename)}\n${content}`.toLowerCase()
  const matches = tasks.filter(task => {
    if (task.subject && task.subject.length > 8 && normalized.includes(task.subject.toLowerCase())) return true
    const fileMatch = task.description.match(/[A-Za-z0-9_./~-]+\.(?:js|jsx|ts|tsx|css|html|json|md|mjs|cjs)/)
    if (fileMatch && normalized.includes(fileMatch[0].toLowerCase())) return true
    return false
  })
  if (!matches.length) return 'reviewed'
  if (matches.some(t => t.status === 'in_progress')) return 'in_progress'
  if (matches.every(t => t.status === 'completed')) return 'implemented'
  return 'reviewed'
}

function getPlanContent(filename) {
  const filepath = path.join(VIEWER_PLANS_DIR, filename)
  if (!fs.existsSync(filepath)) return null
  return fs.readFileSync(filepath, 'utf8')
}

function sidecarPath(filename, suffix) {
  return path.join(VIEWER_PLANS_DIR, filename.replace(/\.md$/, suffix))
}

function loadPlanReview(filename) {
  const filepath = sidecarPath(filename, '.review.json')
  if (!fs.existsSync(filepath)) return null
  try { return JSON.parse(fs.readFileSync(filepath, 'utf8')) } catch { return null }
}

function savePlanReview(filename, review) {
  const normalized = {
    filename,
    decision: review?.decision || 'changes_requested',
    decidedAt: review?.decidedAt || new Date().toISOString(),
    annotationCount: Array.isArray(review?.annotations) ? review.annotations.length : Number(review?.annotationCount || 0),
    annotations: Array.isArray(review?.annotations) ? review.annotations.slice(0, 100) : [],
    checklist: normalizeReviewChecklist(review?.checklist),
    summary: review?.summary || '',
    source: review?.source || 'desktop',
  }
  fs.writeFileSync(sidecarPath(filename, '.review.json'), JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}

function loadPlanTimeline(filename) {
  const filepath = sidecarPath(filename, '.timeline.json')
  if (!fs.existsSync(filepath)) return []
  try {
    const events = JSON.parse(fs.readFileSync(filepath, 'utf8'))
    return Array.isArray(events) ? events : []
  } catch {
    return []
  }
}

function appendPlanTimelineEvent(filename, event) {
  if (!filename) return null
  const events = loadPlanTimeline(filename)
  const next = {
    id: crypto.randomUUID ? crypto.randomUUID() : hashText(`${Date.now()}:${Math.random()}`).slice(0, 16),
    type: event.type || 'event',
    at: event.at || new Date().toISOString(),
    summary: event.summary || '',
    data: event.data || {},
  }
  events.push(next)
  try {
    fs.writeFileSync(sidecarPath(filename, '.timeline.json'), JSON.stringify(events.slice(-200), null, 2), 'utf8')
  } catch (_) {}
  return next
}

function normalizeReviewChecklist(checklist = {}) {
  const keys = ['scope_clear', 'files_identified', 'risks_noted', 'tests_included', 'ambiguities_resolved']
  return keys.reduce((acc, key) => {
    acc[key] = Boolean(checklist?.[key])
    return acc
  }, {})
}

function reviewDecisionTimelineSummary(decision) {
  return {
    approved: 'Plan approved',
    changes_requested: 'Changes requested',
    dismissed: 'Plan dismissed',
    draft: 'Review checklist updated',
  }[decision] || 'Plan reviewed'
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
      if (shouldIgnoreReference(key)) continue
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

function shouldIgnoreReference(refPath) {
  const normalized = String(refPath || '').replace(/\\/g, '/')
  const base = path.basename(normalized)
  if (!base || base.startsWith('.')) return true
  if (normalized.includes('/.git/') || normalized.includes('/.snapshots/')) return true
  if (normalized.startsWith('plans/.')) return true
  return false
}

function resolveReferencePath(root, refPath) {
  if (!root || !refPath) return null
  const candidate = path.resolve(root, refPath)
  const normalizedRoot = path.resolve(root)
  if (candidate === normalizedRoot || !candidate.startsWith(normalizedRoot + path.sep)) return null
  try {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  } catch (_) {
    return null
  }
  if (!refPath.includes('/') && !refPath.includes('\\')) {
    return findFileByBasename(normalizedRoot, refPath)
  }
  return null
}

function findFileByBasename(root, basename) {
  const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.cache', '.snapshots'])
  const stack = [root]
  let visited = 0
  while (stack.length && visited < 3000) {
    const current = stack.pop()
    let entries
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch (_) { continue }
    for (const entry of entries) {
      visited++
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) stack.push(path.join(current, entry.name))
      } else if (entry.name === basename) {
        return path.join(current, entry.name)
      }
      if (visited >= 3000) break
    }
  }
  return null
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
      const review = loadPlanReview(filename)
      const status = inferReviewStatus(filename, review)
        || planMetaCache.statusMap[filename]
        || (livePlans.has(filename) ? 'needs_review' : 'reviewed')
      return {
        filename,
        title:        extractTitle(content, filename),
        modified:     stat.mtime.toISOString(),
        size:         stat.size,
        repo:         planMetaCache.repoMap[filename]    || 'Uncategorized',
        trigger:      planMetaCache.triggerMap[filename] || null,
        live:         livePlans.has(filename),
        source:       planMetaCache.sourceMap[filename]  || 'archive',
        status,
        review,
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

function inferReviewStatus(filename, review) {
  if (livePlans.has(filename)) return 'needs_review'
  if (!review) return null
  if (review.decision === 'changes_requested') return 'changes_requested'
  if (review.decision === 'approved') return 'approved'
  return null
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
      appendPlanTimelineEvent(filename, {
        type: 'created',
        summary: 'Claude plan imported',
        data: { source: 'claude', sourcePath: filepath },
      })
      const sources = loadSourceMeta()
      sources[filename] = {
        source: 'claude',
        sourcePath: filepath,
        sourceId: filename,
        createdAt: sources[filename]?.createdAt || new Date().toISOString(),
      }
      saveSourceMeta(sources)
      livePlans.add(filename)
      saveLiveState()
      updateDockBadge()
      planMetaCache = null
      broadcastPlanUpdate({ live: filename })
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
          if (oldContent !== newContent) {
            saveSnapshot(filename, oldContent)
            appendPlanTimelineEvent(filename, {
              type: 'revised',
              summary: 'Claude plan content changed',
              data: { source: 'claude', sourcePath: filepath },
            })
          }
        } catch (_) {}
      }
      try { fs.copyFileSync(filepath, localPath) } catch (_) {}
      livePlans.add(filename)
      saveLiveState()
      updateDockBadge()
      planMetaCache = null
      broadcastPlanUpdate({ live: filename })
    })
  }

  if (fs.existsSync(CODEX_SESSIONS_DIR)) {
    const watcher = chokidar.watch(CODEX_SESSIONS_DIR, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    })

    const onCodexSessionChange = filepath => {
      const imported = syncCodexPlans(filepath)
      if (!imported.length) return
      for (const filename of imported) livePlans.add(filename)
      saveLiveState()
      updateDockBadge()
      planMetaCache = null
      broadcastPlanUpdate({ live: imported[0] })
    }

    watcher.on('add', onCodexSessionChange)
    watcher.on('change', onCodexSessionChange)
  }

  if (fs.existsSync(CLAUDE_TASKS_DIR)) {
    const watcher = chokidar.watch(CLAUDE_TASKS_DIR, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    })
    const onTaskChange = () => {
      taskIndexCache = null
      planMetaCache = null
      broadcastPlanUpdate({})
    }
    watcher.on('add', onTaskChange)
    watcher.on('change', onTaskChange)
  }

  if (fs.existsSync(PROJECTS_DIR)) {
    const watcher = chokidar.watch(PROJECTS_DIR, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    })
    const onProjectChange = () => {
      projectMetaCache = null
      planMetaCache = null
    }
    watcher.on('add', onProjectChange)
    watcher.on('change', onProjectChange)
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('get-plans', () => getPlans())
ipcMain.handle('get-design-docs', () => getDesignDocs())
ipcMain.handle('get-design-doc-content', (_, filename) => getDesignDocContent(filename))
ipcMain.handle('save-design-doc', (_, filename, content) => saveDesignDoc(filename, content))
ipcMain.handle('create-design-doc', (_, project, title) => createDesignDoc(project, title))
ipcMain.handle('rename-design-doc', (_, filename, nextFilename) => renameDesignDoc(filename, nextFilename))
ipcMain.handle('delete-design-doc', (_, filename) => deleteDesignDoc(filename))
ipcMain.handle('get-design-doc-path', (_, filename) => getDesignDocPath(filename))
ipcMain.handle('reveal-design-doc', (_, filename) => revealDesignDoc(filename))
ipcMain.handle('link-design-folder', () => linkDesignFolder())
ipcMain.handle('get-design-sources', () => getDesignSources())
ipcMain.handle('unlink-design-folder', (_, sourceId) => unlinkDesignFolder(sourceId))
ipcMain.handle('refresh-design-folders', () => refreshDesignFolders())
ipcMain.handle('lint-design-doc', (_, content) => lintDesignDoc(content))
ipcMain.handle('export-design-doc', (_, content, format) => exportDesignDoc(content, format))

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
  planMetaCache = null
  return true
})

ipcMain.handle('load-comments', (_, filename) => {
  const filepath = sidecarPath(filename, '.comments.json')
  if (!fs.existsSync(filepath)) return []
  try { return JSON.parse(fs.readFileSync(filepath, 'utf8')) } catch { return [] }
})

ipcMain.handle('save-comments', (_, filename, comments) => {
  fs.writeFileSync(
    sidecarPath(filename, '.comments.json'),
    JSON.stringify(comments, null, 2),
    'utf8'
  )
  appendPlanTimelineEvent(filename, {
    type: 'annotated',
    summary: `${Array.isArray(comments) ? comments.length : 0} annotations saved`,
    data: { annotationCount: Array.isArray(comments) ? comments.length : 0 },
  })
  return true
})

ipcMain.handle('load-review', (_, filename) => loadPlanReview(filename))
ipcMain.handle('load-timeline', (_, filename) => loadPlanTimeline(filename))

ipcMain.handle('save-review', (_, filename, review) => {
  const saved = savePlanReview(filename, review)
  appendPlanTimelineEvent(filename, {
    type: saved.decision === 'draft' ? 'checklist_updated' : saved.decision,
    summary: saved.summary || reviewDecisionTimelineSummary(saved.decision),
    data: {
      decision: saved.decision,
      annotationCount: saved.annotationCount,
      checklist: saved.checklist,
    },
  })
  planMetaCache = null
  broadcastPlanUpdate({ review: filename })
  return saved
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
  url: sharingServerUrl,
  port: SHARE_PORT,
  unavailable: !sharingServerReady,
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
  fs.mkdirSync(DESIGN_DOCS_DIR,  { recursive: true })
  fs.mkdirSync(SNAPSHOTS_DIR,    { recursive: true })
  ensureDefaultDesignDoc()
  loadLiveState()
  syncPlans()   // copy any plans added while app was closed
  startSharingServer()
  createWindow()
  startDesignDocsWatcher()
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
