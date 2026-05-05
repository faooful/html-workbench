const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const chokidar = require('chokidar')

const DESIGN_DOCS_DIR = path.join(__dirname, 'design-docs')
const DESIGN_SOURCES_FILE = path.join(__dirname, '.design-sources.json')

const DEFAULT_DESIGN_DOC = `---
version: alpha
name: DESIGN.md Workbench Design Language
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

# DESIGN.md Workbench Design Language

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
let designDocsWatcher = null
let designDocsBroadcastTimer = null

function titleCaseSegment(input) {
  return String(input || 'design')
    .replace(/\.[^.]+$/, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Design'
}

function extractDesignFrontMatter(content) {
  const match = String(content || '').match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
  return match ? match[1] : ''
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
  const match = String(content || '').match(/^# (.+)$/m)
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
  const projectDir = path.join(DESIGN_DOCS_DIR, 'design-md-workbench')
  const docPath = path.join(projectDir, 'design.md')
  if (fs.existsSync(docPath)) return
  fs.mkdirSync(projectDir, { recursive: true })
  fs.writeFileSync(docPath, DEFAULT_DESIGN_DOC, 'utf8')
  fs.writeFileSync(path.join(projectDir, 'design.meta.json'), JSON.stringify({
    project: 'design-md-workbench',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'starter',
  }, null, 2), 'utf8')
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 700,
    minHeight: 500,
    title: 'DESIGN.md Workbench',
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
}

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

app.whenReady().then(() => {
  fs.mkdirSync(DESIGN_DOCS_DIR, { recursive: true })
  ensureDefaultDesignDoc()
  createWindow()
  startDesignDocsWatcher()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
