const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const DESIGN_REPOS_FILE = path.join(__dirname, '.design-repos.json')
const IGNORED_SCAN_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage', '.cache', 'out', 'test-results', 'playwright-report', 'venv', '.venv', '__pycache__', '.tox', 'htmlcov', 'target', '.gradle', 'vendor', 'tmp', '.turbo', '.vercel'])
const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.html', '.md', '.mdx', '.json', '.mjs', '.cjs', '.svg'])
const PREVIEW_EXTENSIONS = ['', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '/index.tsx', '/index.ts', '/index.jsx', '/index.js']
const PREVIEW_STYLE_EXTENSIONS = ['', '.css', '.module.css', '.less', '/index.css', '/index.module.css', '/index.less']
const SCAN_FILE_LIMIT = 8000
const SOURCE_SUGGESTION_LIMIT = 600
const COMPONENT_ROW_LIMIT = 300
const COMMON_COLOR_NAMES = {
  '#0000': 'transparent',
  '#ffffff': 'white',
  '#111827': 'gray-900',
  '#6b7280': 'gray-500',
  '#16a34a': 'green-600',
  '#166534': 'green-800',
  '#f0fdf4': 'green-50',
  '#2563eb': 'blue-600',
  '#1e40af': 'blue-800',
  '#93c5fd': 'blue-300',
  '#eff6ff': 'blue-50',
  '#fef2f2': 'red-50',
  '#991b1b': 'red-800',
  '#fffbeb': 'amber-50',
  '#92400e': 'amber-800',
  '#f3f4f6': 'gray-100',
  '#f48fb1': 'pink-300',
  '#fce4ec': 'pink-50',
  '#4a1f3d': 'plum-900',
  '#c2185b': 'pink-700',
  '#0d290f': 'green-950',
}

let mainWindow
const workspacePackageCache = new Map()

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

function repoRecordForPath(repoPath, overrides = {}) {
  const resolved = path.resolve(repoPath)
  return {
    id: sourceIdForPath(resolved),
    name: overrides.name || path.basename(resolved) || 'repo',
    path: resolved,
    createdAt: overrides.createdAt || new Date().toISOString(),
    builtIn: Boolean(overrides.builtIn),
    sourceMap: overrides.sourceMap || null,
  }
}

function loadLinkedRepos() {
  const raw = safeJsonRead(DESIGN_REPOS_FILE, [])
  const saved = Array.isArray(raw)
    ? raw.filter(repo => repo?.path).map(repo => repoRecordForPath(repo.path, repo))
    : []
  const current = repoRecordForPath(__dirname, { name: 'accidental-design-system', builtIn: true })
  return [current, ...saved.filter(repo => repo.id !== current.id)]
}

function saveLinkedRepos(repos) {
  const persisted = repos
    .filter(repo => !repo.builtIn)
    .map(repo => ({
      id: repo.id,
      name: repo.name,
      path: repo.path,
      createdAt: repo.createdAt,
      sourceMap: repo.sourceMap || null,
    }))
  fs.writeFileSync(DESIGN_REPOS_FILE, JSON.stringify(persisted, null, 2), 'utf8')
}

function saveRepoScanPrefs(repoId, sourceMap) {
  const repos = loadLinkedRepos()
  saveLinkedRepos(repos.map(repo => repo.id === repoId ? { ...repo, sourceMap } : repo))
}

function getLinkedRepos() {
  return loadLinkedRepos().map(repo => ({
    id: repo.id,
    name: repo.name,
    path: repo.path,
    createdAt: repo.createdAt,
    builtIn: repo.builtIn,
    sourceMap: repo.sourceMap || null,
  }))
}

async function linkRepo() {
  const result = await dialog.showOpenDialog({
    title: 'Link repository',
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths?.[0]) return null
  const repo = repoRecordForPath(result.filePaths[0])
  const repos = loadLinkedRepos()
  saveLinkedRepos([repo, ...repos.filter(item => item.id !== repo.id)])
  return repo
}

function unlinkRepo(repoId) {
  saveLinkedRepos(loadLinkedRepos().filter(repo => repo.id !== repoId))
  return true
}

function resolveLinkedRepo(repoId) {
  const repo = loadLinkedRepos().find(item => item.id === repoId)
  if (!repo || !fs.existsSync(repo.path)) return null
  return repo
}

function walkRepoFiles(root, limit = SCAN_FILE_LIMIT) {
  const out = []
  const stack = ['']
  while (stack.length && out.length < limit) {
    const relDir = stack.pop()
    const current = path.join(root, relDir)
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch (_) {
      continue
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && !['.agents', '.cursor'].includes(entry.name)) continue
      const rel = path.join(relDir, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_SCAN_DIRS.has(entry.name)) stack.push(rel)
      } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
        out.push(rel)
      }
      if (out.length >= limit) break
    }
  }
  return out.sort()
}

function classifyRepoSource(rel) {
  const normalized = rel.replace(/\\/g, '/')
  const base = path.basename(normalized).toLowerCase()
  const lower = normalized.toLowerCase()
  if (isIconAssetFile(normalized)) {
    return { type: 'asset', reason: 'Icon or brand asset' }
  }
  if (/^(design|design-system|tokens|components)\.mdx?$/.test(base) || lower.includes('/design.md') || lower.includes('/tokens.md') || lower.includes('/components.md')) {
    return { type: 'design-doc', reason: 'Agent/design guidance markdown' }
  }
  if (lower.startsWith('.agents/') || lower.startsWith('.cursor/rules/') || lower.startsWith('docs/')) {
    return { type: 'design-doc', reason: 'Likely agent or design documentation' }
  }
  if (/tailwind\.config\.[cm]?[jt]s$/.test(base)
    || /(^|\/)(globals|global|tailwind|theme|tokens|colors?|palette|variables|foundations?)\.(css|scss|ts|tsx|js|jsx|json)$/.test(lower)
    || /(^|\/)(design-tokens?|foundations?|palette)(\/[^/]+)?\.(ts|tsx|js|jsx|json|css|scss)$/.test(lower)) {
    return { type: 'theme', reason: 'Theme or token source' }
  }
  if (/(^|\/)(components|ui|primitives)(\/|$)/.test(lower)) {
    return { type: 'component', reason: 'Reusable UI component source' }
  }
  if (/^packages\/[^/]+\/(src|lib)\//i.test(lower) && /\.(jsx?|tsx?|css|scss)$/.test(lower)) {
    return { type: 'component', reason: 'Workspace package source' }
  }
  if (/(^|\/)(app|pages|renderer\/src|src|frontend|web|client|webapp)(\/|$)/.test(lower) && /\.(jsx?|tsx?|css|scss)$/.test(lower)) {
    return { type: 'ui-source', reason: 'Likely rendered UI surface' }
  }
  // Broad fallback: any JS/TS/CSS source file not already matched
  if (/\.(jsx?|tsx?|css|scss)$/.test(lower) && !lower.includes('/test') && !lower.includes('/spec') && !lower.includes('/fixture')) {
    return { type: 'ui-source', reason: 'Source file' }
  }
  return null
}

function classifyRepoFile(rel) {
  const classification = classifyRepoSource(rel)
  if (classification) return { ...classification, confidence: sourceConfidence(classification.type, rel) }
  return { type: 'other-source', reason: 'Scannable source file', confidence: 0.1 }
}

function sourceConfidence(type, rel) {
  const lower = String(rel || '').toLowerCase()
  if (type === 'theme') return 0.95
  if (type === 'design-doc') return 0.9
  if (type === 'component') return /(^|\/)(components|ui|primitives)(\/|$)/.test(lower) ? 0.9 : 0.75
  if (type === 'asset') return 0.7
  if (type === 'ui-source') return 0.45
  return 0.1
}

function buildRepoFileIndex(repo) {
  const records = walkRepoFiles(repo.path).map(rel => {
    const normalizedPath = rel.replace(/\\/g, '/')
    const classification = classifyRepoFile(normalizedPath)
    return {
      path: normalizedPath,
      ext: path.extname(normalizedPath).toLowerCase(),
      ...classification,
    }
  })
  return {
    files: records,
    byPath: new Map(records.map(record => [record.path, record])),
  }
}

function extractImportSpecifiers(content) {
  const specifiers = []
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(content))) specifiers.push(match[1])
  }
  return [...new Set(specifiers)]
}

function resolveGraphImportSource(repo, importerRel, specifier) {
  if (!specifier || /^(node:|https?:|data:)/.test(specifier)) return ''
  const importerAbs = path.resolve(repo.path, importerRel)
  const candidates = []
  const addCandidateBase = base => {
    for (const ext of [...PREVIEW_EXTENSIONS, ...PREVIEW_STYLE_EXTENSIONS, '']) {
      candidates.push(base + ext)
    }
  }

  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    addCandidateBase(specifier.startsWith('/')
      ? path.resolve(repo.path, specifier.slice(1))
      : path.resolve(path.dirname(importerAbs), stripImportQuery(specifier)))
  } else if (specifier.startsWith('@/')) {
    addCandidateBase(path.resolve(repo.path, stripImportQuery(specifier.slice(2))))
  } else {
    const workspace = resolveWorkspaceImport(repo, specifier)
    if (workspace && workspace.startsWith(path.resolve(repo.path) + path.sep)) {
      return path.relative(repo.path, workspace).replace(/\\/g, '/')
    }
    const packageImport = resolvePackageImport(repo, importerAbs, specifier)
    if (packageImport && packageImport.startsWith(path.resolve(repo.path) + path.sep)) {
      return path.relative(repo.path, packageImport).replace(/\\/g, '/')
    }
    return ''
  }

  const root = path.resolve(repo.path)
  for (const candidate of candidates) {
    const found = fileIfExists(candidate)
    if (found && (found === root || found.startsWith(root + path.sep))) {
      return path.relative(root, found).replace(/\\/g, '/')
    }
  }
  return ''
}

function extractRepoEdges(repo, fileIndex) {
  const outgoing = new Map()
  const incoming = new Map()
  const definitions = new Map()
  const imports = new Map()

  const addEdge = (from, to, specifier) => {
    if (!to || !fileIndex.byPath.has(to)) return
    const edge = { from, to, specifier }
    if (!outgoing.has(from)) outgoing.set(from, [])
    if (!incoming.has(to)) incoming.set(to, [])
    outgoing.get(from).push(edge)
    incoming.get(to).push(edge)
  }

  for (const record of fileIndex.files) {
    const content = readRepoFile(repo, record.path)
    if (content == null) continue
    if (/\.(jsx?|tsx?|mdx?|cjs|mjs)$/.test(record.ext)) {
      const specifiers = extractImportSpecifiers(content)
      imports.set(record.path, specifiers)
      for (const specifier of specifiers) {
        addEdge(record.path, resolveGraphImportSource(repo, record.path, specifier), specifier)
      }
    }
    if (isSourceCodeFile(record.path) && !isTestOrStoryFile(record.path)) {
      const defs = extractComponentDefinitions(content, record.path)
      if (defs.length) definitions.set(record.path, defs)
    }
  }

  return { outgoing, incoming, definitions, imports }
}

function graphAnchorForRecord(record, sourceSelections) {
  return {
    path: record.path,
    type: record.type,
    reason: record.reason,
    selected: sourceSelections.has(record.path) ? sourceSelections.get(record.path) : true,
    confidence: record.confidence,
  }
}

function isDesignRoot(record, sourceSelections) {
  if (!record || sourceSelections.get(record.path) === false) return false
  if (sourceSelections.get(record.path) === true && record.type !== 'other-source') return true
  if (['design-doc', 'theme', 'component'].includes(record.type)) return true
  if (record.type === 'asset' && isIconAssetFile(record.path)) return true
  return false
}

function selectDesignGraph(repo, fileIndex, edges, sourceMap = null) {
  const sourceSelections = new Map((sourceMap?.anchors || []).map(anchor => [anchor.path, anchor.selected !== false]))
  const anchors = fileIndex.files
    .filter(record => record.type !== 'other-source')
    .map(record => graphAnchorForRecord(record, sourceSelections))
    .slice(0, SOURCE_SUGGESTION_LIMIT)
  const excluded = new Set([...sourceSelections.entries()].filter(([, selected]) => !selected).map(([file]) => file))
  const selected = new Set()
  const confidence = new Map()
  const mark = (file, score = 0.4) => {
    if (!file || excluded.has(file) || !fileIndex.byPath.has(file)) return false
    selected.add(file)
    confidence.set(file, Math.max(confidence.get(file) || 0, score))
    return true
  }

  for (const record of fileIndex.files) {
    if (isDesignRoot(record, sourceSelections)) mark(record.path, record.confidence)
  }

  const roots = [...selected]
  for (const file of roots) {
    const record = fileIndex.byPath.get(file)
    for (const edge of edges.outgoing.get(file) || []) mark(edge.to, Math.max(0.35, (confidence.get(file) || 0.5) - 0.2))
    if (record?.type === 'component' || record?.type === 'theme' || record?.type === 'asset') {
      for (const edge of edges.incoming.get(file) || []) mark(edge.from, Math.max(0.35, (confidence.get(file) || 0.5) - 0.15))
    }
  }

  for (const file of [...selected]) {
    for (const edge of edges.outgoing.get(file) || []) {
      const target = fileIndex.byPath.get(edge.to)
      if (target?.type === 'theme' || target?.type === 'asset' || target?.type === 'component') {
        mark(edge.to, Math.max(0.3, (confidence.get(file) || 0.45) - 0.15))
      }
    }
  }

  let paths = [...selected]
  if (paths.length === 0) {
    paths = fileIndex.files
      .filter(record => /\.(jsx?|tsx?|css|scss)$/.test(record.path) && !excluded.has(record.path))
      .slice(0, 120)
      .map(record => record.path)
    for (const file of paths) confidence.set(file, 0.2)
  }

  const normalizedSourceMap = { anchors: anchors.map(anchor => ({ ...anchor, selected: paths.includes(anchor.path) })) }
  return {
    repo,
    fileIndex,
    edges,
    paths,
    pathSet: new Set(paths),
    confidence,
    sourceMap: normalizedSourceMap,
  }
}

function suggestRepoSources(repoId) {
  const repo = resolveLinkedRepo(repoId)
  if (!repo) return null
  const savedSelections = new Map((repo.sourceMap?.anchors || []).map(anchor => [anchor.path, anchor.selected !== false]))
  const anchors = walkRepoFiles(repo.path)
    .map(rel => {
      const classification = classifyRepoSource(rel)
      if (!classification) return null
      const normalizedPath = rel.replace(/\\/g, '/')
      return {
        path: normalizedPath,
        selected: savedSelections.has(normalizedPath) ? savedSelections.get(normalizedPath) : true,
        ...classification,
      }
    })
    .filter(Boolean)
    .slice(0, SOURCE_SUGGESTION_LIMIT)
  return {
    repo: { id: repo.id, name: repo.name, path: repo.path, builtIn: repo.builtIn },
    anchors,
    generatedAt: new Date().toISOString(),
  }
}

function selectedAnchorPaths(sourceMap) {
  const anchors = Array.isArray(sourceMap?.anchors) ? sourceMap.anchors : []
  return anchors.filter(anchor => anchor.selected !== false).map(anchor => anchor.path)
}

function readRepoFile(repo, rel) {
  const root = path.resolve(repo.path)
  const filepath = path.resolve(root, rel)
  if (filepath !== root && !filepath.startsWith(root + path.sep)) return null
  try {
    const stat = fs.statSync(filepath)
    if (!stat.isFile() || stat.size > 350000) return null
    return fs.readFileSync(filepath, 'utf8')
  } catch (_) {
    return null
  }
}

function displayNameFromFile(rel) {
  const base = path.basename(rel).replace(/\.[^.]+$/, '')
  return base
    .replace(/[-_]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/^\w/, char => char.toUpperCase())
}

function pushCount(map, key, file) {
  if (!key) return
  const current = map.get(key) || { value: key, count: 0, files: new Set() }
  current.count += 1
  if (file) current.files.add(file)
  map.set(key, current)
}

function rankedCounts(map, limit = 30) {
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit)
    .map(item => ({ value: item.value, count: item.count, files: [...item.files].slice(0, 6) }))
}

function rankMapValues(map, limit = 40) {
  return [...map.values()]
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)))
    .slice(0, limit)
}

function lineInfoAt(content, index) {
  const before = content.slice(0, index)
  const line = before.split('\n').length
  const lineStart = before.lastIndexOf('\n') + 1
  const lineEnd = content.indexOf('\n', index)
  return {
    line,
    text: content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd).trim(),
  }
}

function classifyColorOccurrence({ content, index, rel, ext }) {
  const info = lineInfoAt(content, index)
  const beforeMatch = info.text.slice(0, Math.max(0, index - content.lastIndexOf('\n', index) - 1))
  const cssVariable = info.text.match(/(--[a-zA-Z0-9-_]+)\s*:/)
  const objectToken = beforeMatch.match(/['"]?([a-zA-Z0-9-_]+)['"]?\s*:\s*['"]?$/)
  const constToken = beforeMatch.match(/\b(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*['"]?$/)
  const tokenName = name => /^--tw-/.test(name || '') || /^[0-9]+$/.test(name || '') ? '' : name
  if (ext === '.md' || ext === '.mdx') return { kind: 'documentation', ...info }
  if (/^\s*(\/\/|\/\*|\*|#)/.test(info.text)) return { kind: 'documentation', ...info }
  if (/--[a-zA-Z0-9-_]+\s*:\s*$/.test(beforeMatch) || /--[a-zA-Z0-9-_]+\s*:/.test(info.text)) {
    return {
      kind: /:root|\[data-theme|theme/i.test(content.slice(Math.max(0, index - 500), index)) ? 'theme-token' : 'token-declaration',
      tokenName: tokenName(cssVariable?.[1] || ''),
      ...info,
    }
  }
  if (constToken) return { kind: 'token-declaration', tokenName: tokenName(constToken[1]), ...info }
  if (/\b(colors|theme|tokens)\b/i.test(rel) && /['"]?[a-zA-Z0-9-_]+['"]?\s*:\s*['"]?$/.test(beforeMatch)) {
    return { kind: 'token-declaration', tokenName: tokenName(objectToken?.[1] || ''), ...info }
  }
  return { kind: 'direct-usage', ...info }
}

function pushColorOccurrence(map, value, file, occurrence) {
  const normalizedValue = normalizeColorValue(value)
  if (!normalizedValue) return
  const current = map.get(normalizedValue) || { value: normalizedValue, count: 0, files: new Set(), occurrences: [], tokenNames: new Set() }
  current.count += 1
  if (file) current.files.add(file)
  if (occurrence?.tokenName) current.tokenNames.add(occurrence.tokenName)
  current.occurrences.push({ file, ...occurrence })
  map.set(normalizedValue, current)
}

function normalizeColorValue(value) {
  const raw = String(value || '').trim()
  const hex = raw.match(/^#([0-9a-fA-F]{3,8})$/)
  if (!hex) return raw
  const body = hex[1].toLowerCase()
  if (body.length === 3 || body.length === 4) {
    return `#${body.split('').map(char => char + char).join('')}`
  }
  return `#${body}`
}

function rankedColors(map, limit = 80) {
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit)
    .map(item => {
      const breakdown = item.occurrences.reduce((next, occurrence) => {
        next[occurrence.kind] = (next[occurrence.kind] || 0) + 1
        return next
      }, {})
      return {
        value: item.value,
        count: item.count,
        files: [...item.files].slice(0, 6),
        tokenNames: (() => {
          const names = [...(item.tokenNames || [])].filter(name => name && !/^--tw-/.test(name) && !/^[0-9]+$/.test(name))
          if (!names.length && COMMON_COLOR_NAMES[String(item.value).toLowerCase()]) names.push(COMMON_COLOR_NAMES[String(item.value).toLowerCase()])
          return names.slice(0, 8)
        })(),
        breakdown,
        occurrences: item.occurrences.slice(0, 12),
      }
    })
}

function extractClassNames(content) {
  const values = []
  const patterns = [
    /className\s*=\s*["'`]([^"'`]+)["'`]/g,
    /class\s*=\s*["'`]([^"'`]+)["'`]/g,
    /className\s*:\s*["'`]([^"'`]+)["'`]/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(content))) values.push(match[1])
  }
  return values
}

function isIconName(name) {
  return /^[A-Z][A-Za-z0-9]*$/.test(name || '') &&
    /(Icon|Logo|Glyph|Mark)$/.test(name || '') &&
    !/^(Icon|SvgIcon|IconBase|BaseIcon|AsShadcnIcon)$/.test(name || '')
}

function isIconAssetFile(file) {
  const normalized = file.replace(/\\/g, '/')
  const base = path.basename(normalized)
  return /\.svg$/i.test(base) && /(^|\/)(icons?|logos?|marks?|glyphs?|assets?)(\/|$)|(-|_)?(icon|logo|glyph|mark)\.svg$/i.test(normalized)
}

function isIconWrapperFile(file) {
  const normalized = file.replace(/\\/g, '/')
  const base = path.basename(normalized)
  return /(^|\/)(icons?|logos?|marks?|glyphs?)(\/|$)/i.test(normalized) ||
    /(Icon|Logo|Glyph|Mark)\.[jt]sx?$/.test(base)
}

function isKnownIconImport(source) {
  return source === 'lucide-react' ||
    /^@datadog\/druids-icons-standalone\//.test(source || '') ||
    /^@druids\/ui\/(icons|misc)\//.test(source || '') ||
    /^@bits\/gui\/core\/icons/.test(source || '') ||
    /(^|\/)(icons?|logos?|marks?|glyphs?)(\/|$)/i.test(source || '')
}

function sourceKindForIcon(importPath, kind) {
  if (kind === 'svg-asset') return 'Local SVG'
  if (importPath === 'lucide-react' || /^@datadog\//.test(importPath || '') || /^@druids\//.test(importPath || '') || /^@bits\//.test(importPath || '')) return 'Package'
  if (kind === 'icon-component') return 'Wrapper'
  if (kind === 'asset-import') return 'Local SVG'
  return 'Icon'
}

function canonicalIconImportPath(item) {
  if (!item.importPath) return item.value || item.sourceFile || item.name
  if (item.importPath === 'lucide-react') return `${item.importPath}/${item.name.replace(/Icon$/, '')}`
  if (/^@datadog\/druids-icons-standalone\//.test(item.importPath)) return item.importPath
  if (/^@druids\/ui\/(icons|misc)\//.test(item.importPath)) return item.importPath
  if (/^@bits\/gui\/core\/icons/.test(item.importPath) && item.name) return `${item.importPath}/${item.name}`
  return item.importPath
}

function sanitizeSvgMarkup(svg) {
  const match = String(svg || '').match(/<svg[\s\S]*?<\/svg>/i)
  if (!match) return ''
  return match[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son[A-Za-z]+\s*=\s*{?["'][^"'}]*["']}?/g, '')
    .replace(/\s\{[\s\S]*?\}/g, '')
    .replace(/\sclassName=/g, ' class=')
    .replace(/\s(strokeWidth|strokeLinecap|strokeLinejoin|fillRule|clipRule)=/g, attr => ` ${attr.trim().replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}=`)
}

function validSvgMarkup(svg) {
  const normalized = sanitizeSvgMarkup(svg)
  if (!normalized) return ''
  if (!/^<svg\b[\s\S]*<\/svg>$/i.test(normalized.trim())) return ''
  if (!/<(path|circle|rect|line|polyline|polygon|ellipse|g|use|defs|symbol|text|image)\b/i.test(normalized)) return ''
  if (/\b(React\.|ImageProps|TODO|const\s+\w+\s*=|interface\s+\w+|type\s+\w+\s*=)\b/.test(normalized)) return ''
  return normalized
}

function spriteSvgToVisible(svg) {
  const symbol = String(svg || '').match(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/i)
  if (!symbol) return validSvgMarkup(svg)
  const viewBox = symbol[1].match(/viewBox=["']([^"']+)["']/i)?.[1] || '0 0 192 192'
  return validSvgMarkup(`<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">${symbol[2]}</svg>`)
}

function lucideNameForImport(name) {
  return String(name || '')
    .replace(/Icon$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

function lucideSvgForIcon(repo, name) {
  const iconFile = path.join(repo.path, 'node_modules', 'lucide-react', 'dist', 'esm', 'icons', `${lucideNameForImport(name)}.js`)
  let content
  try {
    content = fs.readFileSync(iconFile, 'utf8')
  } catch (_) {
    return ''
  }
  const nodeMatch = content.match(/const __iconNode = (\[[\s\S]*?\]);/)
  if (!nodeMatch) return ''
  try {
    const nodes = Function(`"use strict"; return (${nodeMatch[1]});`)()
    const body = nodes.map(([tag, attrs]) => {
      const attrText = Object.entries(attrs || {})
        .filter(([key]) => key !== 'key')
        .map(([key, value]) => `${key.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}="${String(value)}"`)
        .join(' ')
      return `<${tag} ${attrText}></${tag}>`
    }).join('')
    return validSvgMarkup(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`)
  } catch (_) {
    return ''
  }
}

function extractSvgFromCode(content) {
  return validSvgMarkup(content)
}

function stripImportQuery(specifier) {
  return String(specifier || '').split('?')[0]
}

function resolveRelativeAsset(repo, sourceFile, specifier) {
  if (!sourceFile || !specifier || !specifier.startsWith('.')) return ''
  const root = path.resolve(repo.path)
  const base = path.resolve(root, path.dirname(sourceFile), stripImportQuery(specifier))
  for (const item of candidatePaths(base)) {
    const found = fileIfExists(item)
    if (found && found.startsWith(root + path.sep)) return path.relative(root, found).replace(/\\/g, '/')
  }
  return ''
}

function iconSvgForSource(repo, sourceFile, seen = new Set()) {
  if (!sourceFile || seen.has(sourceFile)) return ''
  seen.add(sourceFile)
  const content = readRepoFile(repo, sourceFile)
  if (!content) return ''
  if (/\.svg$/i.test(sourceFile)) return validSvgMarkup(content)

  const direct = extractSvgFromCode(content)
  if (direct) return direct

  for (const match of content.matchAll(/from\s+["']([^"']+\.svg(?:\?[^"']*)?)["']|import\s+\w+\s+from\s+["']([^"']+\.svg(?:\?[^"']*)?)["']/g)) {
    const asset = resolveRelativeAsset(repo, sourceFile, match[1] || match[2])
    const svg = iconSvgForSource(repo, asset, seen)
    if (svg) return svg
  }

  for (const match of content.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']|export\s+\{[^}]+\}\s+from\s+["']([^"']+)["']/g)) {
    const target = resolveRelativeAsset(repo, sourceFile, match[1] || match[2])
    const svg = iconSvgForSource(repo, target, seen)
    if (svg) return svg
  }

  const dir = path.resolve(repo.path, path.dirname(sourceFile))
  try {
    const svgFile = fs.readdirSync(dir).find(file => /\.svg$/i.test(file))
    if (svgFile) return iconSvgForSource(repo, path.join(path.dirname(sourceFile), svgFile).replace(/\\/g, '/'), seen)
  } catch (_) {
    return ''
  }
  return ''
}

function resolveReExportSource(repo, sourceFile, exportName, seen = new Set()) {
  if (!sourceFile || seen.has(`${sourceFile}:${exportName}`)) return ''
  seen.add(`${sourceFile}:${exportName}`)
  const content = readRepoFile(repo, sourceFile)
  if (!content) return ''

  for (const match of content.matchAll(/import\s+\{\s*([A-Za-z0-9_]+)\s+as\s+([A-Za-z0-9_]+)\s*\}\s+from\s+["']([^"']+)["']/g)) {
    const imported = match[1]
    const local = match[2]
    const importPath = match[3]
    const exportPattern = new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*[\\s\\S]{0,300}\\b${local}\\b`)
    if (exportPattern.test(content)) return importPath.endsWith(`/${imported}`) ? importPath : importPath
  }

  for (const match of content.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) {
    const nextSource = resolveImportSourceForScan(repo, sourceFile, match[1])
    const found = resolveReExportSource(repo, nextSource, exportName, seen)
    if (found) return found
  }

  for (const match of content.matchAll(/export\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g)) {
    const names = match[1].split(',').map(item => item.trim())
    if (names.some(item => item === exportName || item.endsWith(` as ${exportName}`))) return match[2]
  }

  return ''
}

function bundledSpriteSvgForImport(repo, importPath) {
  let resolved
  try {
    resolved = require.resolve(importPath, { paths: collectNodePaths(repo) })
  } catch (_) {
    return ''
  }
  let content
  try {
    content = fs.readFileSync(resolved, 'utf8')
  } catch (_) {
    return ''
  }
  const template = content.match(/`(<svg[\s\S]*?<\/svg>)`/)
  return template ? spriteSvgToVisible(template[1]) : ''
}

function iconSvgForImport(repo, sourceFile, importPath, iconName) {
  if (importPath === 'lucide-react') return lucideSvgForIcon(repo, iconName)
  const directSprite = /^@datadog\/druids-icons-standalone\//.test(importPath) ? bundledSpriteSvgForImport(repo, importPath) : ''
  if (directSprite) return directSprite

  const reExport = resolveReExportSource(repo, sourceFile, iconName)
  if (reExport) {
    const sprite = bundledSpriteSvgForImport(repo, reExport)
    if (sprite) return sprite
    const nextSource = resolveImportSourceForScan(repo, sourceFile, reExport)
    const sourceSvg = iconSvgForSource(repo, nextSource)
    if (sourceSvg) return sourceSvg
  }

  return iconSvgForSource(repo, sourceFile)
}

function pushIconRecord(map, key, next) {
  if (!isIconName(next.name) && next.kind !== 'svg-asset' && next.kind !== 'asset-import') return
  const svg = validSvgMarkup(next.svg || '')
  const importPath = next.importPath || ''
  const sourceKind = next.sourceKind || sourceKindForIcon(importPath, next.kind)
  const renderStatus = svg ? 'Rendered' : 'No preview'
  const displayPath = next.displayPath || canonicalIconImportPath({ ...next, importPath })
  const current = map.get(key) || {
    name: next.name,
    value: displayPath || next.value || next.name,
    count: 0,
    files: new Set(),
    sourceFiles: new Set(),
    importPath,
    displayPath,
    kind: next.kind || 'icon',
    sourceKind,
    renderStatus,
    svg,
  }
  current.count += next.referenceCount || 0
  if (next.file) current.files.add(next.file)
  if (next.sourceFile) current.sourceFiles.add(next.sourceFile)
  if (!current.svg && svg) {
    current.svg = svg
    current.renderStatus = 'Rendered'
  }
  if (!current.importPath && importPath) current.importPath = importPath
  if (!current.displayPath && displayPath) {
    current.displayPath = displayPath
    current.value = displayPath
  }
  if (current.sourceKind === 'Icon' && sourceKind !== 'Icon') current.sourceKind = sourceKind
  map.set(key, current)
}

function extractIconRecords(content, file) {
  const icons = []
  if (!isSourceCodeFile(file) || isTestOrStoryFile(file)) return icons
  const named = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g
  let match
  while ((match = named.exec(content))) {
    if (match[1]) continue
    const source = match[3]
    for (const raw of match[2].split(',')) {
      const parts = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/i)
      const imported = (parts[0] || '').trim()
      const local = (parts[1] || parts[0] || '').trim()
      const importedIcon = isIconName(imported)
      const localIcon = isIconName(local)
      if ((localIcon || importedIcon || isKnownIconImport(source)) && hasJsxUsage(content, local)) {
        const name = localIcon ? local : importedIcon ? imported : local
        if (isIconName(name) || isKnownIconImport(source)) {
          icons.push({ name, importPath: source, file, kind: 'icon-import', referenceCount: 1 })
        }
      }
    }
  }
  const defaultImport = /import\s+([A-Z][A-Za-z0-9_]*)\s+from\s+["']([^"']+\.(?:svg|png|webp|gif))["']/g
  while ((match = defaultImport.exec(content))) {
    icons.push({ name: match[1], importPath: match[2], file, kind: 'asset-import', referenceCount: 1 })
  }
  if (isIconWrapperFile(file) && /(\.svg(?:\?[^"']*)?|asShadcnIcon|<svg\b|createIcon|Icon\s+icon=)/.test(content)) {
    for (const def of extractComponentDefinitions(content, file)) {
      if (isIconName(def.name)) {
        icons.push({
          name: def.name,
          value: def.name,
          sourceFile: file,
          kind: 'icon-component',
          referenceCount: 0,
          svg: extractSvgFromCode(content),
        })
      }
    }
  }
  return icons
}

function rankedIconRecords(map, limit = Infinity) {
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(item => ({
      value: item.value,
      name: item.name,
      count: item.count,
      files: [...item.files].slice(0, 8),
      sourceFiles: [...item.sourceFiles].slice(0, 8),
      importPath: item.importPath,
      displayPath: item.displayPath,
      kind: item.kind,
      sourceKind: item.sourceKind,
      renderStatus: item.renderStatus,
      svg: item.svg,
    }))
}

function isSourceCodeFile(file) {
  return /\.(jsx?|tsx?|mjs|cjs)$/.test(file)
}

function isPreviewableSourceFile(file) {
  return /\.(jsx|tsx)$/.test(file)
}

function isTestOrStoryFile(file) {
  return /\.(test|spec|stories|story)\.[jt]sx?$/.test(file) || /(^|\/)(__tests__|__mocks__|test-helpers?|fixtures?)(\/|$)/i.test(file)
}

function isLikelyComponentName(name) {
  return /^[A-Z][A-Za-z0-9]*$/.test(name || '') &&
    !/^[A-Z0-9_]+$/.test(name || '') &&
    !/^use[A-Z]/.test(name || '') &&
    !/(Context|Config|Keys|Actions|Constants|Telemetry|Schema|Store|Reducer|Route|Routes)$/.test(name || '')
}

function hasJsxUsage(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<${escaped}(\\s|>|\\.)`).test(content) ||
    new RegExp(`React\\.createElement\\(\\s*${escaped}\\b`).test(content)
}

function extractComponentImports(content, file) {
  const imports = []
  if (!isSourceCodeFile(file) || isTestOrStoryFile(file)) return imports
  const named = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g
  let match
  while ((match = named.exec(content))) {
    if (match[1]) continue
    const source = match[3]
    for (const raw of match[2].split(',')) {
      const parts = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/i)
      const imported = parts[0]?.trim()
      const local = (parts[1] || parts[0] || '').trim()
      if (isLikelyComponentName(local) && hasJsxUsage(content, local)) imports.push({ name: local, imported, source, file, usageKind: 'jsx-import' })
    }
  }
  const defaultImport = /import\s+([A-Z][A-Za-z0-9_]*)\s+from\s+["']([^"']+)["']/g
  while ((match = defaultImport.exec(content))) {
    if (isLikelyComponentName(match[1]) && hasJsxUsage(content, match[1])) imports.push({ name: match[1], imported: 'default', source: match[2], file, usageKind: 'jsx-import' })
  }
  return imports
}

function exportNamesFromList(raw) {
  return raw
    .split(',')
    .map(item => item.trim())
    .map(item => {
      const parts = item.replace(/^type\s+/, '').split(/\s+as\s+/i)
      return (parts[1] || parts[0] || '').trim()
    })
    .filter(isLikelyComponentName)
}

function extractComponentDefinitions(content, file) {
  if (!isSourceCodeFile(file) || isTestOrStoryFile(file)) return []
  const definitions = new Map()
  const EXPORT_KINDS = new Set(['named-export', 'default-export'])
  const add = (name, exportKind = 'local-definition', previewable = exportKind !== 'local-definition' && isPreviewableSourceFile(file)) => {
    if (!isLikelyComponentName(name)) return
    const existing = definitions.get(name)
    // Never downgrade an already-found exported component to a local-definition match
    if (existing && exportKind === 'local-definition' && EXPORT_KINDS.has(existing.exportKind)) return
    definitions.set(name, { name, file, exportKind, previewable, sourceFile: file })
  }

  for (const match of content.matchAll(/export\s+default\s+function\s+([A-Z][A-Za-z0-9]*)\s*\(/g)) add(match[1], 'default-export')
  for (const match of content.matchAll(/export\s+function\s+([A-Z][A-Za-z0-9]*)\s*\(/g)) add(match[1], 'named-export')
  for (const match of content.matchAll(/function\s+([A-Z][A-Za-z0-9]*)\s*\([^)]*\)\s*(?::[^{]+)?\{/g)) {
    const start = match.index || 0
    const window = content.slice(start, start + 1200)
    if (/<[A-Za-z][\w.: -]*(\s|>)/.test(window) || /React\.createElement/.test(window)) add(match[1])
  }

  const variablePattern = /(export\s+)?(?:const|let|var)\s+([A-Z][A-Za-z0-9]*)\s*(?::[^=]+)?=\s*([^;\n]+)/g
  for (const match of content.matchAll(variablePattern)) {
    const initializer = match[3] || ''
    if (/forwardRef|memo|React\.forwardRef|React\.memo|\([^)]*\)\s*=>|function\s*\(/.test(initializer)) {
      const start = match.index || 0
      const window = content.slice(start, start + 1400)
      if (/forwardRef|memo|<[A-Za-z][\w.: -]*(\s|>)|React\.createElement/.test(window)) add(match[2], match[1] ? 'named-export' : 'local-definition')
    }
  }

  for (const match of content.matchAll(/export\s+\{([^}]+)\}(?:\s+from\s+["'][^"']+["'])?/g)) {
    for (const name of exportNamesFromList(match[1])) {
      if (definitions.has(name)) {
        definitions.set(name, { ...definitions.get(name), exportKind: 'named-export' })
      } else if (!/\s+from\s+["']/.test(match[0])) {
        add(name, 'named-export', isPreviewableSourceFile(file))
      }
    }
  }

  return [...definitions.values()]
}

function componentKey(name, importPath, sourceFile) {
  return `${name}::${sourceFile || importPath || ''}`
}

function pushComponentRecord(map, next) {
  const key = componentKey(next.name, next.importPath, next.sourceFile)
  const current = map.get(key) || {
    name: next.name,
    importPath: next.importPath || '',
    sourceFile: next.sourceFile || '',
    exportKind: next.exportKind || 'unknown',
    previewable: next.previewable !== false,
    references: new Set(),
    definitionFiles: new Set(),
    count: 0,
    unresolved: Boolean(next.unresolved),
  }
  if (next.file) current.references.add(next.file)
  if (next.sourceFile) current.definitionFiles.add(next.sourceFile)
  if (next.definitionFile) current.definitionFiles.add(next.definitionFile)
  current.count += next.referenceCount || (next.file ? 1 : 0)
  current.previewable = current.previewable || next.previewable === true
  current.unresolved = current.unresolved && Boolean(next.unresolved)
  if (!current.importPath && next.importPath) current.importPath = next.importPath
  if (!current.sourceFile && next.sourceFile) current.sourceFile = next.sourceFile
  if (current.exportKind === 'unknown' && next.exportKind) current.exportKind = next.exportKind
  map.set(key, current)
}

function rankedComponentRecords(map, limit = COMPONENT_ROW_LIMIT) {
  return [...map.values()]
    .sort((a, b) => b.count - a.count || Number(Boolean(b.definitionFiles.size)) - Number(Boolean(a.definitionFiles.size)) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(item => ({
      value: `${item.name} from ${item.importPath || item.sourceFile || 'local definition'}`,
      name: item.name,
      count: item.count,
      files: [...item.references].slice(0, 8),
      definitionFiles: [...item.definitionFiles].slice(0, 8),
      importPath: item.importPath,
      sourceFile: item.sourceFile,
      exportKind: item.exportKind,
      previewable: item.previewable,
      unresolved: item.unresolved,
      status: item.count ? (item.definitionFiles.size ? 'used-and-defined' : 'referenced-unresolved') : 'defined-unreferenced',
    }))
}

function resolveImportSourceForScan(repo, file, source) {
  const local = resolveLocalImport(repo, { metadata: { importPath: source }, files: [file] })
  if (!local.error && local.specifier && local.specifier.startsWith(path.resolve(repo.path) + path.sep)) {
    return path.relative(repo.path, local.specifier).replace(/\\/g, '/')
  }
  const workspace = resolveWorkspaceImport(repo, source)
  if (workspace && workspace.startsWith(path.resolve(repo.path) + path.sep)) {
    return path.relative(repo.path, workspace).replace(/\\/g, '/')
  }
  return ''
}

function normalizeComponentName(name) {
  return String(name || '')
    .replace(/^(Base|Core|Ui)/, '')
    .replace(/(Primitive|Component)$/, '')
    .toLowerCase()
}

function componentPathConflicts(imports) {
  const groups = new Map()
  for (const item of imports) {
    const key = normalizeComponentName(item.name)
    if (!key) continue
    const current = groups.get(key) || { component: item.name, normalized: key, sources: new Map(), files: new Set(), count: 0 }
    current.count += 1
    current.files.add(item.file)
    current.sources.set(item.source, (current.sources.get(item.source) || 0) + 1)
    groups.set(key, current)
  }
  return [...groups.values()]
    .filter(group => group.sources.size > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map(group => ({
      component: group.component,
      count: group.count,
      sources: [...group.sources.entries()].map(([source, count]) => ({ source, count })),
      files: [...group.files].slice(0, 8),
      message: `${group.component} is imported from ${group.sources.size} paths`,
    }))
}

function classifyClassPattern(value) {
  if (/(^|\s)(grid|flex|gap-|items-|justify-|space-|p-|px-|py-|m-|mx-|my-|w-|h-|min-|max-)/.test(value)) return 'layout-recipe'
  if (/(^|\s)(bg-|text-|border-|shadow-|rounded-|ring-|opacity-)/.test(value)) return 'visual-recipe'
  return 'utility-cluster'
}

function classPatternClusters(repeatedPatterns) {
  return repeatedPatterns.map(item => ({
    ...item,
    kind: classifyClassPattern(item.value),
    message: `${item.count} repeats of a ${classifyClassPattern(item.value).replace('-', ' ')}`,
  }))
}

function directStyleUsage(colors, smells) {
  const colorUsages = []
  for (const color of colors) {
    for (const occurrence of color.occurrences || []) {
      if (occurrence.kind === 'direct-usage') {
        colorUsages.push({
          type: 'direct-color',
          value: color.value,
          file: occurrence.file,
          line: occurrence.line,
          text: occurrence.text,
          message: `${color.value} is used directly instead of through a token`,
        })
      }
    }
  }
  return [...colorUsages, ...smells.filter(smell => smell.type === 'inline-style')]
}

function rowId(type, value) {
  return crypto.createHash('sha1').update(`${type}:${value}`).digest('hex').slice(0, 12)
}

function inventoryRow(type, name, item, category, metadata = {}) {
  const value = item?.value || item?.text || item?.dont || item?.message || name
  return {
    id: rowId(type, value),
    type,
    name,
    value,
    count: item?.count || item?.occurrences?.length || item?.files?.length || 1,
    files: item?.files || (item?.file ? [item.file] : []),
    occurrences: item?.occurrences || [],
    category,
    metadata,
  }
}

function classCategory(value) {
  if (/^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space)-/.test(value)) return 'Spacing'
  if (/^(text|font|leading|tracking)-/.test(value)) return 'Typography'
  if (/^rounded/.test(value)) return 'Radius'
  if (/^(flex|grid|items|justify|content|place|self|col|row)-/.test(value)) return 'Layout'
  if (/^(bg|border|ring|shadow|opacity)-/.test(value)) return 'Visual'
  return 'Class'
}

function buildInventoryRows({ colors, cssVariables, tailwindClasses, componentImports, icons, repeatedPatterns, guidanceRules, antiPatterns, smells, sourceMap }) {
  const sourceRows = (sourceMap?.anchors || [])
    .filter(anchor => anchor.selected !== false)
    .map(anchor => inventoryRow('File', anchor.path, { value: anchor.path, files: [anchor.path] }, SOURCE_LABELS_FOR_ROW[anchor.type] || 'Source', { reason: anchor.reason, sourceType: anchor.type }))
  return [
    ...componentImports.map(item => {
      const row = inventoryRow('Component', item.name || item.value, item, item.count ? 'Used component' : 'Defined component', {
        importPath: item.importPath || '',
        sourceFile: item.sourceFile || '',
        definitionFiles: item.definitionFiles || [],
        exportKind: item.exportKind || 'unknown',
        previewable: item.previewable !== false,
        unresolved: Boolean(item.unresolved),
        status: item.status || 'unknown',
        kind: 'component',
      })
      return {
        ...row,
        count: item.count || 0,
        files: item.files || [],
      }
    }),
    ...icons.map(item => inventoryRow('Icon', item.name || item.value, item, item.kind === 'svg-asset' ? 'SVG asset' : 'Icon', {
      importPath: item.importPath || '',
      displayPath: item.displayPath || item.importPath || item.value || '',
      sourceFiles: item.sourceFiles || [],
      kind: item.kind || 'icon',
      sourceKind: item.sourceKind || sourceKindForIcon(item.importPath, item.kind),
      renderStatus: item.renderStatus || (item.svg ? 'Rendered' : 'No preview'),
      svg: item.svg || '',
    })),
    ...cssVariables.map(item => inventoryRow('Token', item.value, item, 'CSS variable', { kind: 'css-variable' })),
    ...colors.map(item => inventoryRow('Color', item.tokenNames?.[0] || item.value, item, 'Color', { breakdown: item.breakdown || {}, kind: 'color', tokenNames: item.tokenNames || [] })),
    ...tailwindClasses.map(item => inventoryRow('Class', item.value, item, classCategory(item.value), { kind: 'tailwind-class' })),
    ...repeatedPatterns.map(item => inventoryRow('Class', item.value, item, 'Repeated recipe', { kind: 'repeated-pattern' })),
    ...guidanceRules.map(item => inventoryRow('File', item.text, { ...item, value: item.text }, 'Guidance', { section: item.section, kind: 'guidance-rule' })),
    ...antiPatterns.map(item => inventoryRow('File', item.dont, { ...item, value: item.dont }, 'Anti-pattern', { instead: item.instead, kind: 'anti-pattern' })),
    ...smells.map(item => inventoryRow('Class', item.message, { ...item, value: item.message }, 'Style smell', { kind: item.type })),
    ...sourceRows,
  ].map((row, index) => ({ ...row, id: `${row.id}-${index}` }))
}

const SOURCE_LABELS_FOR_ROW = {
  'design-doc': 'Design doc',
  theme: 'Theme source',
  component: 'Component source',
  'ui-source': 'UI source',
  asset: 'Asset source',
  'other-source': 'Source',
}

function sourceMapHealth(sourceMap, paths, graph = null) {
  const anchors = Array.isArray(sourceMap?.anchors) ? sourceMap.anchors : []
  const selected = anchors.filter(anchor => paths.includes(anchor.path))
  const counts = selected.reduce((next, anchor) => {
    next[anchor.type] = (next[anchor.type] || 0) + 1
    return next
  }, {})
  const graphRecords = graph?.fileIndex
    ? paths.map(file => graph.fileIndex.byPath.get(file)).filter(Boolean)
    : selected
  const graphCounts = graphRecords.reduce((next, record) => {
    next[record.type] = (next[record.type] || 0) + 1
    return next
  }, {})
  const lowConfidenceFiles = graph
    ? paths.filter(file => (graph.confidence.get(file) || 0) < 0.35).length
    : 0
  const warnings = [
    paths.length > 140 && `${paths.length} graph-selected files is noisy; tighten scan settings before trusting the table.`,
    (graphCounts['ui-source'] || 0) > 30 && !(graphCounts['design-doc'] || 0) && 'Implementation files dominate the scan, but no guidance docs are selected.',
    (graphCounts['design-doc'] || 0) > 30 && (graphCounts['ui-source'] || 0) <= 3 && 'Docs dominate the scan, but too few UI files ground the guidance.',
    !(graphCounts.theme || 0) && 'No theme/token root was found in the graph.',
    !(graphCounts.component || 0) && 'No component root was found in the graph.',
    (graphCounts.component || 0) > 0 && (graphCounts['ui-source'] || 0) <= 1 && 'Component roots were found, but too few consuming UI files were connected.',
    lowConfidenceFiles > 30 && `${lowConfidenceFiles} low-confidence files were included through graph expansion.`,
  ].filter(Boolean)
  const recommendedSources = selected
    .filter(anchor => ['design-doc', 'theme', 'component'].includes(anchor.type))
    .slice(0, 10)
    .concat(selected.filter(anchor => anchor.type === 'ui-source').slice(0, 6))
  return {
    selected: selected.length,
    counts: graph ? graphCounts : counts,
    warnings,
    status: warnings.length >= 2 ? 'weak' : warnings.length ? 'mixed' : 'balanced',
    recommendedSources,
  }
}

function extractMarkdownGuidance(content, file) {
  const guidanceRules = []
  const antiPatterns = []
  let section = ''
  for (const line of content.split('\n')) {
    const heading = line.match(/^##+\s+(.+)/)
    if (heading) section = heading[1].trim()
    const bullet = line.match(/^\s*[-*]\s+(.+)/)
    if (bullet && /(gotchas?|rules?|patterns?|choices|do|don't|avoid|never|always|use|instead)/i.test(`${section} ${bullet[1]}`)) {
      guidanceRules.push({ text: bullet[1].replace(/\*\*/g, '').trim(), section: section || 'Guidance', file })
    }
    if (/^\|/.test(line) && /\|\s*<|don't|do instead|never|avoid/i.test(line)) {
      const cells = line.split('|').map(cell => cell.trim()).filter(Boolean)
      if (cells.length >= 2 && !cells.every(cell => /^-+$/.test(cell))) {
        antiPatterns.push({ dont: cells[0], instead: cells[1] || '', file })
      }
    }
  }
  return { guidanceRules, antiPatterns }
}

function extractDesignFacts(repo, graph) {
  const paths = graph.paths
  const pathSet = graph.pathSet
  const colorCounts = new Map()
  const cssVarCounts = new Map()
  const classCounts = new Map()
  const patternCounts = new Map()
  const componentRecords = new Map()
  const iconRecords = new Map()
  const importDetails = []
  const guidanceRules = []
  const antiPatterns = []
  const smells = []

  for (const rel of paths) {
    const content = readRepoFile(repo, rel)
    if (content == null) continue
    const ext = path.extname(rel).toLowerCase()

    if (ext === '.svg' && isIconAssetFile(rel)) {
      const name = displayNameFromFile(rel)
      pushIconRecord(iconRecords, `asset:${rel}`, {
        name,
        value: rel,
        sourceFile: rel,
        kind: 'svg-asset',
        svg: validSvgMarkup(content),
      })
      continue
    }

    for (const match of content.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g)) {
      pushColorOccurrence(colorCounts, match[0], rel, classifyColorOccurrence({ content, index: match.index, rel, ext }))
    }
    for (const match of content.matchAll(/--[a-zA-Z0-9-_]+/g)) pushCount(cssVarCounts, match[0], rel)
    for (const classString of extractClassNames(content)) {
      pushCount(patternCounts, classString.trim().replace(/\s+/g, ' '), rel)
      for (const token of classString.split(/\s+/).filter(Boolean)) pushCount(classCounts, token, rel)
    }
    for (const item of extractComponentImports(content, rel)) {
      importDetails.push(item)
      const sourceFile = resolveImportSourceForScan(repo, rel, item.source)
      const graphSourceFile = sourceFile && pathSet.has(sourceFile) ? sourceFile : ''
      pushComponentRecord(componentRecords, {
        name: item.name,
        importPath: item.source,
        sourceFile: graphSourceFile,
        file: rel,
        referenceCount: 1,
        exportKind: item.imported === 'default' ? 'default-import' : 'named-import',
        previewable: true,
        unresolved: !graphSourceFile && (item.source.startsWith('.') || item.source.startsWith('@/') || item.source.startsWith('/')),
      })
    }
    for (const item of extractIconRecords(content, rel)) {
      const sourceFile = item.importPath ? resolveImportSourceForScan(repo, rel, item.importPath) : item.sourceFile
      pushIconRecord(iconRecords, `${item.name}::${sourceFile || item.importPath || item.sourceFile || rel}`, {
        ...item,
        sourceFile,
        svg: item.svg || iconSvgForImport(repo, sourceFile, item.importPath, item.name),
      })
    }
    for (const item of extractComponentDefinitions(content, rel)) {
      pushComponentRecord(componentRecords, {
        name: item.name,
        sourceFile: item.sourceFile,
        definitionFile: item.file,
        exportKind: item.exportKind,
        previewable: item.previewable,
      })
    }
    if (/\bstyle\s*=\s*\{\{/.test(content)) smells.push({ type: 'inline-style', message: 'Inline style object found', file: rel })
    if (/(className|class)\s*=\s*["'`][^"'`]*(bg-white\/|text-white\/|border-border|text-purple-|bg-green-|rounded-lg border border-border)/.test(content)) {
      smells.push({ type: 'visual-override', message: 'Potential ad-hoc visual class pattern', file: rel })
    }
    if ((ext === '.md' || ext === '.mdx') && /gotchas?|anti-pattern|do instead|never|always|don't/i.test(content)) {
      const guidance = extractMarkdownGuidance(content, rel)
      guidanceRules.push(...guidance.guidanceRules)
      antiPatterns.push(...guidance.antiPatterns)
    }
  }

  const colors = rankedColors(colorCounts, 100)
  const cssVariables = rankedCounts(cssVarCounts, 100)
  const tailwindClasses = rankedCounts(classCounts, 50)
  const repeatedPatterns = rankedCounts(patternCounts, 20).filter(item => item.count > 1)
  const componentImports = rankedComponentRecords(componentRecords)
  const icons = rankedIconRecords(iconRecords)
  const conflicts = componentPathConflicts(importDetails)
  const clusters = classPatternClusters(repeatedPatterns)
  const directUsage = directStyleUsage(colors, smells)
  const missingContext = [
    !colors.length && !cssVariables.length && 'No colors or CSS variables found in selected sources.',
    !componentImports.length && 'No reusable component imports found in selected sources.',
    !guidanceRules.length && 'No markdown guidance rules found.',
    !antiPatterns.length && 'No explicit anti-pattern table or do/don\'t guidance found.',
  ].filter(Boolean)
  const summary = {
    scannedFiles: paths.length,
    colors: colors.length,
    cssVariables: cssVariables.length,
    tailwindClasses: tailwindClasses.length,
    componentImports: componentImports.length,
    icons: icons.length,
    componentDefinitions: componentImports.filter(item => item.definitionFiles?.length).length,
    unresolvedComponents: componentImports.filter(item => item.unresolved).length,
    unreferencedComponents: componentImports.filter(item => !item.count).length,
    guidanceRules: guidanceRules.length,
    antiPatterns: antiPatterns.length,
    smells: smells.length,
  }
  const limitedGuidanceRules = guidanceRules.slice(0, 40)
  const limitedAntiPatterns = antiPatterns.slice(0, 40)
  const limitedSmells = smells.slice(0, 40)
  const inventoryRows = buildInventoryRows({
    colors,
    cssVariables,
    tailwindClasses,
    componentImports,
    icons,
    repeatedPatterns,
    guidanceRules: limitedGuidanceRules,
    antiPatterns: limitedAntiPatterns,
    smells: limitedSmells,
    sourceMap: graph.sourceMap,
  })

  return {
    summary,
    inventoryRows,
    componentPathConflicts: conflicts,
    classPatternClusters: clusters,
    directStyleUsage: directUsage,
    colors,
    cssVariables,
    tailwindClasses,
    componentImports,
    icons,
    repeatedPatterns,
    guidanceRules: limitedGuidanceRules,
    antiPatterns: limitedAntiPatterns,
    smells: limitedSmells,
    missingContext,
  }
}

function scanRepoDesignInventory(repoId, sourceMap = null) {
  const repo = resolveLinkedRepo(repoId)
  if (!repo) return null
  const fileIndex = buildRepoFileIndex(repo)
  const edges = extractRepoEdges(repo, fileIndex)
  const graph = selectDesignGraph(repo, fileIndex, edges, sourceMap)
  const facts = extractDesignFacts(repo, graph)
  const result = {
    repo: { id: repo.id, name: repo.name, path: repo.path, builtIn: repo.builtIn },
    sourceMap: graph.sourceMap,
    sourceMapHealth: sourceMapHealth(graph.sourceMap, graph.paths, graph),
    ...facts,
  }
  saveRepoScanPrefs(repo.id, graph.sourceMap)
  return result
}

function getComponentSource(repoId, componentRow) {
  const repo = resolveLinkedRepo(repoId)
  if (!repo) return null
  const name = componentRow.name || ''

  // Try definition files first (local components)
  const defFiles = componentRow.metadata?.definitionFiles || (componentRow.metadata?.sourceFile ? [componentRow.metadata.sourceFile] : [])
  for (const file of defFiles) {
    const fullPath = path.isAbsolute(file) ? file : path.join(repo.path, file)
    try {
      const src = fs.readFileSync(fullPath, 'utf8')
      const lines = src.split('\n')
      const pattern = new RegExp(`(function|const|class)\\s+${name}[\\s(<]`)
      const defIdx = lines.findIndex(l => pattern.test(l))
      const start = Math.max(0, defIdx >= 0 ? defIdx : 0)
      const snippet = lines.slice(start, start + 40).join('\n')
      return { file, snippet, kind: 'definition', language: /\.[mc]?tsx?$/.test(file) ? 'ts' : 'js' }
    } catch (_) {}
  }

  // Fall back: show usage context from a file that imports this component
  const usageFiles = (componentRow.files || []).slice(0, 3)
  for (const file of usageFiles) {
    const fullPath = path.isAbsolute(file) ? file : path.join(repo.path, file)
    try {
      const src = fs.readFileSync(fullPath, 'utf8')
      const lines = src.split('\n')
      // Find import line or JSX usage
      const importIdx = lines.findIndex(l => l.includes(name) && /import/.test(l))
      const usageIdx = lines.findIndex(l => new RegExp(`<${name}[\\s/>]`).test(l))
      const anchor = importIdx >= 0 ? importIdx : usageIdx >= 0 ? usageIdx : -1
      if (anchor < 0) continue
      const start = Math.max(0, anchor - 2)
      const snippet = lines.slice(start, start + 30).join('\n')
      return { file, snippet, kind: 'usage', language: /\.[mc]?tsx?$/.test(file) ? 'ts' : 'js' }
    } catch (_) {}
  }

  return null
}

async function detectDevServer(repo) {
  const pkgPath = path.join(repo.path, 'package.json')
  if (!fs.existsSync(pkgPath)) return null
  let scripts = {}
  try { scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts || {} } catch (_) { return null }

  const scriptKeys = ['dev', 'devlocal', 'dev:gui', 'start']
  const matchedKey = scriptKeys.find(k => scripts[k])
  if (!matchedKey) return null
  const devScript = scripts[matchedKey]

  // Must look like a web dev server — exclude Electron/desktop launchers
  const isWebDevServer = /next|vite|webpack|react-scripts|parcel|remix|nuxt|gatsby|sveltekit|astro|devlocal/.test(devScript)
  if (!isWebDevServer) return null

  let port = 3000
  let protocol = 'http'
  if (/vite/.test(devScript)) port = 5173
  if (/devlocal|8443/.test(devScript) || /devlocal/.test(matchedKey)) { port = 8443; protocol = 'https' }
  if (/next/.test(devScript)) port = 3000

  const packageManager = fs.existsSync(path.join(repo.path, 'bun.lockb')) ? 'bun'
    : fs.existsSync(path.join(repo.path, 'yarn.lock')) ? 'yarn' : 'npm'

  const url = `${protocol}://localhost:${port}`

  // Verify something is actually serving HTTP at this URL (not just a TCP port being open)
  const running = await new Promise(resolve => {
    const req = require('http').get(url.replace('https:', 'http:'), { timeout: 1500 }, res => {
      res.destroy()
      resolve(res.statusCode < 600)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })

  return { url, port, running, command: `${packageManager} run ${matchedKey}` }
}

function candidatePaths(filepath) {
  return PREVIEW_EXTENSIONS.map(ext => filepath + ext)
}

function fileIfExists(filepath) {
  try {
    const stat = fs.statSync(filepath)
    return stat.isFile() ? filepath : null
  } catch (_) {
    return null
  }
}

function resolveLocalImport(repo, componentRow) {
  const importPath = componentRow?.metadata?.importPath

  const root = path.resolve(repo.path)
  const sourceFile = componentRow?.metadata?.sourceFile
  if (!importPath && sourceFile) {
    const resolvedSource = path.resolve(root, sourceFile)
    if (resolvedSource.startsWith(root + path.sep) && fileIfExists(resolvedSource)) return { specifier: resolvedSource }
  }
  if (!importPath) return { error: 'No import path or source file was detected for this component.' }

  const firstReference = componentRow.files?.[0] || ''
  const referenceDir = firstReference ? path.dirname(path.resolve(root, firstReference)) : root
  const candidates = []

  if (importPath.startsWith('.')) candidates.push(path.resolve(referenceDir, importPath))
  if (importPath.startsWith('@/')) candidates.push(path.resolve(root, importPath.slice(2)))
  if (importPath.startsWith('/')) candidates.push(path.resolve(root, importPath.slice(1)))
  if (!importPath.startsWith('.') && !importPath.startsWith('@/') && !importPath.startsWith('/')) {
    try {
      return { specifier: require.resolve(importPath, { paths: [path.join(root, 'node_modules')] }) }
    } catch (_) {
      return { specifier: importPath, packageImport: true }
    }
  }

  for (const base of candidates) {
    for (const item of candidatePaths(base)) {
      const found = fileIfExists(item)
      if (found && found.startsWith(root + path.sep)) return { specifier: found }
    }
  }
  return { error: `Could not resolve ${importPath}` }
}

function packageNameFromSpecifier(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || /^[A-Za-z]:/.test(specifier)) return ''
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

function collectNodePaths(repo) {
  const roots = new Set()
  let current = path.resolve(repo.path)
  while (current && current !== path.dirname(current)) {
    roots.add(path.join(current, 'node_modules'))
    current = path.dirname(current)
  }
  roots.add(path.join(__dirname, 'node_modules'))
  return [...roots].filter(item => fs.existsSync(item))
}

function findPackageJsonFiles(root, limit = 1200) {
  const out = []
  const stack = ['']
  while (stack.length && out.length < limit) {
    const relDir = stack.pop()
    const current = path.join(root, relDir)
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch (_) {
      continue
    }
    for (const entry of entries) {
      if (entry.name === 'package.json') {
        out.push(path.join(current, entry.name))
        continue
      }
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') && entry.name !== '.config') continue
      if (IGNORED_SCAN_DIRS.has(entry.name) || entry.name === '.yarn') continue
      stack.push(path.join(relDir, entry.name))
      if (out.length >= limit) break
    }
  }
  return out
}

function workspacePackages(repo) {
  const root = path.resolve(repo.path)
  if (workspacePackageCache.has(root)) return workspacePackageCache.get(root)
  const packages = new Map()
  for (const filepath of findPackageJsonFiles(root)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(filepath, 'utf8'))
      if (manifest.name) packages.set(manifest.name, { dir: path.dirname(filepath), manifest })
    } catch (_) {
      // Ignore malformed package files. The scanner should stay opportunistic.
    }
  }
  workspacePackageCache.set(root, packages)
  return packages
}

function resolveWorkspaceImport(repo, specifier) {
  const packageName = packageNameFromSpecifier(specifier)
  if (!packageName) return null
  const pkg = workspacePackages(repo).get(packageName)
  if (!pkg) return null
  const subpath = specifier.slice(packageName.length)
  const exportKey = subpath ? `.${subpath}` : '.'
  const exported = pkg.manifest.exports?.[exportKey]
  const exportTarget = typeof exported === 'string'
    ? exported
    : exported?.import || exported?.browser || exported?.default
  const bases = [
    exportTarget && path.resolve(pkg.dir, exportTarget),
    subpath && path.resolve(pkg.dir, subpath.slice(1)),
    subpath && path.resolve(pkg.dir, 'src', subpath.slice(1)),
    !subpath && pkg.manifest.source && path.resolve(pkg.dir, pkg.manifest.source),
    !subpath && pkg.manifest.module && path.resolve(pkg.dir, pkg.manifest.module),
    !subpath && pkg.manifest.main && path.resolve(pkg.dir, pkg.manifest.main),
    !subpath && path.resolve(pkg.dir, 'src/index'),
    !subpath && path.resolve(pkg.dir, 'index'),
  ].filter(Boolean)

  for (const base of bases) {
    for (const item of candidatePaths(base)) {
      const found = fileIfExists(item)
      if (found) return found
    }
  }
  return null
}

function packageTargetValue(target) {
  if (typeof target === 'string') return target
  if (!target || typeof target !== 'object') return ''
  return target.browser || target.import || target.default || target.require || ''
}

function resolvePackageImportTarget(pkgDir, target) {
  const targetValue = packageTargetValue(target)
  if (!targetValue) return null
  const base = path.resolve(pkgDir, targetValue)
  for (const item of candidatePaths(base)) {
    const found = fileIfExists(item)
    if (found) return found
  }
  return null
}

function resolvePackageImport(repo, importer, specifier) {
  if (!specifier?.startsWith('#')) return null
  const root = path.resolve(repo.path)
  let current = importer && path.isAbsolute(importer) ? path.dirname(importer) : root
  while (current && current.startsWith(root)) {
    const manifestFile = path.join(current, 'package.json')
    if (fs.existsSync(manifestFile)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
        const imports = manifest.imports || {}
        if (imports[specifier]) return resolvePackageImportTarget(current, imports[specifier])
        for (const [key, target] of Object.entries(imports)) {
          if (!key.includes('*')) continue
          const [prefix, suffix = ''] = key.split('*')
          if (!specifier.startsWith(prefix) || (suffix && !specifier.endsWith(suffix))) continue
          const matched = specifier.slice(prefix.length, suffix ? -suffix.length : undefined)
          const targetValue = packageTargetValue(target)
          if (!targetValue) continue
          const replaced = targetValue.includes('*') ? targetValue.replace('*', matched) : targetValue
          const found = resolvePackageImportTarget(current, replaced)
          if (found) return found
        }
      } catch (_) {
        return null
      }
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 760,
    minHeight: 540,
    title: 'Accidental Design System',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

ipcMain.handle('get-linked-repos', () => getLinkedRepos())
ipcMain.handle('link-repo', () => linkRepo())
ipcMain.handle('unlink-repo', (_, repoId) => unlinkRepo(repoId))
ipcMain.handle('suggest-repo-sources', (_, repoId) => suggestRepoSources(repoId))
ipcMain.handle('scan-repo-design-inventory', (_, repoId, sourceMap) => scanRepoDesignInventory(repoId, sourceMap))
ipcMain.handle('get-component-source', (_, repoId, componentRow) => getComponentSource(repoId, componentRow))
ipcMain.handle('get-dev-server-info', (_, repoId) => {
  const repo = resolveLinkedRepo(repoId)
  return repo ? detectDevServer(repo) : null
})

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (/^https:\/\/localhost(:\d+)?\//.test(url)) {
    event.preventDefault()
    callback(true)
  } else {
    callback(false)
  }
})

app.whenReady().then(() => {
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
