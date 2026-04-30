// Split-pane design.md editor

let docs = []
let activeFilename = null
let activeContent = ''
let dirty = false
let saveTimer = null
let paletteIndex = 0
let paletteItems = []
let paneMode = 'split'
let activePreviewTab = 'document'
let theme = 'dark'
let syncingScroll = false
let activeAnalysis = null
let lintTimer = null
let latestLintRequest = 0

const app = document.getElementById('app')
const docList = document.getElementById('doc-list')
const newDocBtn = document.getElementById('new-doc-btn')
const renameDocBtn = document.getElementById('rename-doc-btn')
const deleteDocBtn = document.getElementById('delete-doc-btn')
const sidebarToggle = document.getElementById('sidebar-toggle')
const activeTitle = document.getElementById('active-title')
const commandBtn = document.getElementById('command-btn')
const themeBtn = document.getElementById('theme-btn')
const saveBtn = document.getElementById('save-btn')
const copyBtn = document.getElementById('copy-btn')
const copyPathBtn = document.getElementById('copy-path-btn')
const agentInstructionBtn = document.getElementById('agent-instruction-btn')
const revealDocBtn = document.getElementById('reveal-doc-btn')
const exportJsonBtn = document.getElementById('export-json-btn')
const exportTailwindBtn = document.getElementById('export-tailwind-btn')
const moreActionsBtn = document.getElementById('more-actions-btn')
const moreActionsMenu = document.getElementById('more-actions-menu')
const editorFullBtn = document.getElementById('editor-full-btn')
const previewFullBtn = document.getElementById('preview-full-btn')
const editor = document.getElementById('markdown-editor')
const lineNumbers = document.getElementById('line-numbers')
const documentPreview = document.getElementById('document-preview')
const tokensPreview = document.getElementById('tokens-preview')
const componentsPreview = document.getElementById('components-preview')
const issuesPreview = document.getElementById('issues-preview')
const previewScroll = document.getElementById('preview-scroll')
const previewTabs = [...document.querySelectorAll('.preview-tab')]
const saveState = document.getElementById('save-state')
const stats = document.getElementById('stats')
const syncScrollToggle = document.getElementById('sync-scroll')
const palette = document.getElementById('palette')
const paletteInput = document.getElementById('palette-input')
const paletteList = document.getElementById('palette-list')
const paletteBackdrop = document.getElementById('palette-backdrop')
const newDocModal = document.getElementById('new-doc-modal')
const newDocForm = document.getElementById('new-doc-form')
const newDocTitleInput = document.getElementById('new-doc-title-input')
const newDocProjectInput = document.getElementById('new-doc-project-input')
const newDocCancel = document.getElementById('new-doc-cancel')
const toast = document.getElementById('toast')

marked.setOptions({ gfm: true, breaks: false })

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function slug(input) {
  return String(input || 'design')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'design'
}

function titleFromMarkdown(content, fallback = 'design.md') {
  const match = String(content || '').match(/^#\s+(.+)$/m)
  if (match) return match[1].trim()
  return fallback.split('/').pop().replace(/\.md$/, '').split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function projectFromFilename(filename) {
  return String(filename || '').split('/')[0] || 'local'
}

function getPrefs() {
  try { return JSON.parse(localStorage.getItem('designEditorPrefs') || '{}') } catch (_) { return {} }
}

function setPrefs(next) {
  localStorage.setItem('designEditorPrefs', JSON.stringify({ ...getPrefs(), ...next }))
}

function setToast(message) {
  toast.textContent = message
  toast.classList.add('visible')
  clearTimeout(setToast.timer)
  setToast.timer = setTimeout(() => toast.classList.remove('visible'), 1800)
}

function setSaveState(label, mode = '') {
  saveState.textContent = label
  saveState.dataset.mode = mode
}

function normalizeDoc(doc) {
  const readiness = doc.readiness || { state: 'needs_structure', warnings: [] }
  return {
    filename: doc.filename,
    title: doc.title || titleFromMarkdown('', doc.filename),
    project: doc.project || doc.repo || projectFromFilename(doc.filename),
    path: doc.path || '',
    modified: doc.modified || new Date().toISOString(),
    summary: doc.summary || '',
    status: doc.status || readiness.state || 'needs_structure',
    readiness,
  }
}

async function loadDocs() {
  docs = (await window.planAPI.getDesignDocs()).map(normalizeDoc)
  renderDocLists()
  const prefs = getPrefs()
  const target = docs.find(doc => doc.filename === prefs.lastDesignDoc)?.filename || docs[0]?.filename
  if (target) await openDoc(target)
}

async function openDoc(filename) {
  if (dirty) await saveNow()
  const content = await window.planAPI.getDesignDocContent(filename)
  if (content == null) return
  activeFilename = filename
  activeContent = content
  dirty = false
  editor.value = content
  activeTitle.textContent = titleFromMarkdown(content, filename)
  setPrefs({ lastDesignDoc: filename })
  renderDocLists()
  updateAll()
  setSaveState('Saved')
}

function renderDocLists() {
  const grouped = new Map()
  docs.forEach(doc => {
    const group = doc.project || projectFromFilename(doc.filename)
    if (!grouped.has(group)) grouped.set(group, [])
    grouped.get(group).push(doc)
  })

  const activeDocs = [...grouped.entries()].map(([project, projectDocs]) => `
    <div class="doc-group project-group">
      <button class="doc-group-title" data-project="${escapeHtml(project)}"><span class="group-caret">›</span><strong>${escapeHtml(project)}</strong><em>${projectDocs.length}</em></button>
      ${projectDocs.map(docRow).join('')}
    </div>
  `).join('')

  docList.innerHTML = `
    <div class="workspace-section">
      ${activeDocs || '<div class="empty-list">No design docs yet.</div>'}
    </div>
  `
}

function docRow(doc) {
  const active = doc.filename === activeFilename ? ' active' : ''
  const status = doc.status || doc.readiness?.state || 'needs_structure'
  const label = statusLabel(status)
  return `<button class="doc-row${active}" data-filename="${escapeHtml(doc.filename)}">
    <span class="doc-icon">#</span>
    <span>
      <strong>${escapeHtml(doc.title)}</strong>
      <em>${escapeHtml(doc.filename)}</em>
    </span>
    <span class="doc-badge ${escapeHtml(statusClass(status))}" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
  </button>`
}

function workflowCounts() {
  return docs.reduce((acc, doc) => {
    const state = doc.status || doc.readiness?.state || 'needs_structure'
    acc.all++
    if (state === 'ready') acc.ready++
    else if (state === 'warnings') acc.warnings++
    else acc.needs_structure++
    if (state === 'ready' || state === 'warnings') acc.exportable++
    return acc
  }, { all: 0, needs_structure: 0, warnings: 0, ready: 0, exportable: 0 })
}

function statusLabel(status) {
  if (status === 'ready') return 'Ready'
  if (status === 'warnings') return 'Warnings'
  return 'Draft'
}

function statusClass(status) {
  if (status === 'ready') return 'ready'
  if (status === 'warnings') return 'warnings'
  return 'needs-structure'
}

function updateAll() {
  updateLineNumbers()
  updateStats()
  renderPreview()
}

function updateLineNumbers() {
  const count = Math.max(1, editor.value.split('\n').length)
  lineNumbers.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n')
}

function updateStats() {
  const text = editor.value
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const lines = Math.max(1, text.split('\n').length)
  stats.textContent = `Characters: ${text.length.toLocaleString()} · Words: ${words.toLocaleString()} · Lines: ${lines.toLocaleString()}`
}

function scheduleSave() {
  dirty = true
  setSaveState('Unsaved', 'dirty')
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveNow(), 700)
}

async function saveNow() {
  if (!activeFilename) return
  clearTimeout(saveTimer)
  const nextContent = editor.value
  setSaveState('Saving...', 'saving')
  const saved = await window.planAPI.saveDesignDoc(activeFilename, nextContent)
  if (!saved) {
    setSaveState('Save failed', 'error')
    return
  }
  activeContent = nextContent
  dirty = false
  setSaveState('Saved')
  docs = (await window.planAPI.getDesignDocs()).map(normalizeDoc)
  renderDocLists()
}

function sectionContent(content, headingName) {
  const lines = String(content || '').split('\n')
  const start = lines.findIndex(line => new RegExp(`^##\\s+${headingName}\\b`, 'i').test(line.trim()))
  if (start < 0) return ''
  const out = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break
    out.push(lines[i])
  }
  return out.join('\n').trim()
}

function renderPreview() {
  const content = editor.value
  activeAnalysis = analyzeDesignDoc(content)
  renderDocument(activeAnalysis)
  renderTokens(activeAnalysis)
  renderComponents(activeAnalysis)
  renderIssues(activeAnalysis)
  scheduleLint(activeAnalysis)
}

function analyzeDesignDoc(content) {
  const extracted = extractFrontMatter(content)
  const tokens = extracted.error ? {} : extracted.data || {}
  const body = extracted.body || content
  const localIssues = validateDesignDoc(extracted, tokens, body)
  return {
    raw: content,
    body,
    frontMatter: extracted.frontMatter,
    hasFrontMatter: extracted.hasFrontMatter,
    frontMatterError: extracted.error,
    tokens,
    tokenGroups: tokenGroups(tokens),
    components: parseSpecComponents(tokens),
    fallbackTokens: extracted.hasFrontMatter ? [] : parseProseTokens(content),
    fallbackComponents: extracted.hasFrontMatter ? [] : parseProseComponents(content),
    localIssues,
    lintReport: activeAnalysis?.raw === content ? activeAnalysis?.lintReport : null,
  }
}

function extractFrontMatter(content) {
  const text = String(content || '')
  if (!text.startsWith('---\n')) return { hasFrontMatter: false, body: text, data: {}, frontMatter: '' }
  const end = text.indexOf('\n---', 4)
  if (end < 0) return { hasFrontMatter: true, body: '', data: {}, frontMatter: text.slice(4), error: 'Missing closing front matter fence.' }
  const frontMatter = text.slice(4, end)
  const body = text.slice(end + 4).replace(/^\n/, '')
  try {
    return { hasFrontMatter: true, frontMatter, body, data: parseSimpleYaml(frontMatter) }
  } catch (err) {
    return { hasFrontMatter: true, frontMatter, body, data: {}, error: err.message || 'Could not parse YAML front matter.' }
  }
}

function parseSimpleYaml(source) {
  const root = {}
  const stack = [{ indent: -1, value: root }]
  for (const raw of source.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const indent = raw.match(/^\s*/)[0].length
    const line = raw.trim()
    const match = line.match(/^([^:]+):(.*)$/)
    if (!match) throw new Error(`Invalid YAML line: ${line}`)
    const key = match[1].trim().replace(/^["']|["']$/g, '')
    const rest = match[2].trim()
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop()
    const parent = stack[stack.length - 1].value
    if (!rest) {
      parent[key] = {}
      stack.push({ indent, value: parent[key] })
    } else {
      parent[key] = parseYamlScalar(rest)
    }
  }
  return root
}

function parseYamlScalar(value) {
  const clean = value.replace(/\s+#.*$/, '').trim()
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    return clean.slice(1, -1)
  }
  if (/^(true|false)$/i.test(clean)) return clean.toLowerCase() === 'true'
  if (/^-?\d+(\.\d+)?$/.test(clean)) return Number(clean)
  return clean
}

function tokenGroups(tokens) {
  return {
    colors: tokens.colors || {},
    typography: tokens.typography || {},
    spacing: tokens.spacing || {},
    rounded: tokens.rounded || {},
  }
}

function flattenTokenEntries(groups) {
  const entries = []
  for (const [group, values] of Object.entries(groups)) {
    for (const [name, value] of Object.entries(values || {})) {
      entries.push({ group, name, value, resolved: resolveTokenValue(value, groups), type: tokenType(group, value) })
    }
  }
  return entries
}

function tokenType(group, value) {
  if (group === 'colors' || isColor(value)) return 'color'
  if (group === 'typography') return 'type'
  if (group === 'spacing' || group === 'rounded') return 'size'
  return 'text'
}

function isColor(value) {
  return /^(#[0-9a-f]{3,8}\b|rgba?\(|hsla?\()/i.test(String(value || ''))
}

function resolvePath(root, path) {
  return String(path || '').split('.').reduce((acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined), root)
}

function resolveTokenValue(value, tokens) {
  if (typeof value !== 'string') return { value, display: formatTokenValue(value), unresolved: [] }
  const refs = [...value.matchAll(/\{([^}]+)\}/g)].map(match => match[1])
  const unresolved = refs.filter(ref => resolvePath(tokens, ref) === undefined)
  const display = value.replace(/\{([^}]+)\}/g, (_, ref) => {
    const resolved = resolvePath(tokens, ref)
    return resolved === undefined ? `{${ref}}` : formatTokenValue(resolved)
  })
  return { value: display, display, unresolved }
}

function formatTokenValue(value) {
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, child]) => `${key}: ${child}`).join(', ')
  }
  return String(value ?? '')
}

function validateDesignDoc(extracted, tokens, body) {
  const findings = []
  if (!extracted.hasFrontMatter) {
    findings.push({ severity: 'warning', path: 'frontmatter', message: 'Missing YAML front matter. This can still render, but it is prose-only and not a complete DESIGN.md contract.' })
  }
  if (extracted.frontMatterError) {
    findings.push({ severity: 'error', path: 'frontmatter', message: extracted.frontMatterError })
  }
  if (extracted.hasFrontMatter && !tokens.colors?.primary) {
    findings.push({ severity: 'warning', path: 'colors.primary', message: 'Add colors.primary so agents have a canonical accent or brand color.' })
  }
  if (extracted.hasFrontMatter && !tokens.typography) {
    findings.push({ severity: 'warning', path: 'typography', message: 'Add typography tokens for headings, body text, and labels.' })
  }
  if (extracted.hasFrontMatter && !tokens.components) {
    findings.push({ severity: 'info', path: 'components', message: 'Add component tokens to render concrete component examples.' })
  }
  const unresolved = collectUnresolvedRefs(tokens)
  unresolved.forEach(ref => findings.push({ severity: 'warning', path: ref.owner, message: `Unresolved token reference {${ref.ref}}.` }))
  const sections = [...body.matchAll(/^##\s+(.+)$/gm)].map(match => match[1].trim())
  const seen = new Set()
  sections.forEach(section => {
    const canonical = canonicalSection(section)
    if (seen.has(canonical)) findings.push({ severity: 'error', path: `section.${section}`, message: `Duplicate section heading: ${section}.` })
    seen.add(canonical)
  })
  return findings
}

function canonicalSection(section) {
  if (/brand & style/i.test(section)) return 'Overview'
  if (/layout & spacing/i.test(section)) return 'Layout'
  if (/^elevation$/i.test(section)) return 'Elevation & Depth'
  return section
}

function collectUnresolvedRefs(value, root = value, owner = 'frontmatter') {
  const refs = []
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\{([^}]+)\}/g)) {
      if (resolvePath(root, match[1]) === undefined) refs.push({ owner, ref: match[1] })
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) refs.push(...collectUnresolvedRefs(child, root, `${owner}.${key}`))
  }
  return refs
}

function parseProseTokens(content) {
  const tokens = []
  const tokenText = sectionContent(content, 'Tokens')
  for (const line of tokenText.split('\n')) {
    const match = line.match(/^\s*[-*]?\s*([^:]+):\s*(.+)$/)
    if (!match) continue
    const name = match[1].replace(/[`*_]/g, '').trim()
    const value = match[2].replace(/[`*_]/g, '').trim()
    tokens.push({ group: 'detected', name, value, resolved: { display: value, unresolved: [] }, type: tokenType('detected', value) })
  }
  return tokens
}

function parseProseComponents(content) {
  const componentText = sectionContent(content, '(Components|Components And Patterns|Patterns)')
  if (!componentText) return []
  const chunks = componentText.split(/(?=^###\s+)/m).filter(Boolean)
  return chunks.map(chunk => {
    const title = chunk.match(/^###\s+(.+)$/m)?.[1]?.trim() || 'Component'
    const variants = chunk.match(/Variants?:\s*(.+)$/im)?.[1]?.split(/,\s*/).filter(Boolean) || ['Primary', 'Secondary', 'Ghost']
    const sizes = chunk.match(/Sizes?:\s*(.+)$/im)?.[1]?.split(/,\s*/).filter(Boolean) || ['Small', 'Medium', 'Large']
    const states = chunk.match(/States?:\s*(.+)$/im)?.[1]?.split(/,\s*/).filter(Boolean) || ['Default', 'Hover', 'Disabled']
    return { title, variants, sizes, states, body: chunk.replace(/^###\s+.+$/m, '').trim(), definition: chunk.trim(), source: 'prose' }
  })
}

function parseSpecComponents(tokens) {
  const components = tokens.components || {}
  return Object.entries(components).map(([name, props]) => ({ name, title: titleCase(name), props: props || {}, source: 'frontmatter' }))
}

function titleCase(value) {
  return String(value || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function renderDocument(analysis) {
  const summary = analysis.hasFrontMatter ? renderContractSummary(analysis) : '<div class="contract-summary prose-only"><strong>Prose-only draft</strong><span>Add YAML front matter to turn this into a Stitch-style DESIGN.md contract.</span></div>'
  documentPreview.innerHTML = `${summary}${marked.parse(analysis.body || '')}`
}

function renderContractSummary(analysis) {
  const groups = analysis.tokenGroups
  const issueCount = [...analysis.localIssues, ...(analysis.lintReport?.findings || [])].filter(f => f.severity !== 'info').length
  return `<div class="contract-summary ${issueCount ? 'has-issues' : 'ready'}">
    <strong>${escapeHtml(analysis.tokens.name || 'DESIGN.md contract')}</strong>
    <span>${Object.keys(groups.colors).length} colors · ${Object.keys(groups.typography).length} type styles · ${Object.keys(groups.spacing).length} spacing · ${analysis.components.length} components</span>
    <em>${issueCount ? `${issueCount} issue${issueCount === 1 ? '' : 's'}` : 'Ready'}</em>
  </div>`
}

function renderTokens(analysis) {
  const entries = analysis.hasFrontMatter ? flattenTokenEntries(analysis.tokenGroups) : analysis.fallbackTokens
  if (!entries.length) {
    tokensPreview.innerHTML = '<div class="preview-empty">Add Stitch-style YAML front matter with <code>colors</code>, <code>typography</code>, <code>spacing</code>, and <code>rounded</code> tokens.</div>'
    return
  }
  const grouped = entries.reduce((acc, token) => {
    if (!acc[token.group]) acc[token.group] = []
    acc[token.group].push(token)
    return acc
  }, {})
  tokensPreview.innerHTML = Object.entries(grouped).map(([group, tokens]) => `
    <section class="token-group">
      <div class="preview-section-title">${escapeHtml(titleCase(group))}</div>
      <div class="token-grid">${tokens.map(token => `
      <div class="token-card">
        <span class="token-swatch ${token.type}" style="${token.type === 'color' ? `background:${escapeHtml(token.resolved.display || token.value)}` : ''}"></span>
        <div>
          <strong>${escapeHtml(token.name)}</strong>
          <code>${escapeHtml(token.resolved.display || token.value)}</code>
          ${token.resolved.unresolved?.length ? `<small>Unresolved: ${escapeHtml(token.resolved.unresolved.join(', '))}</small>` : ''}
        </div>
      </div>`).join('')}</div>
    </section>`).join('')
}

function renderComponents(analysis) {
  const components = analysis.hasFrontMatter ? analysis.components : analysis.fallbackComponents
  if (!components.length) {
    componentsPreview.innerHTML = '<div class="preview-empty">Add a <code>components:</code> map in YAML front matter. Markdown component prose will still render in the Document tab.</div>'
    return
  }
  const accent = resolveTokenValue('{colors.primary}', analysis.tokens).display || '#5E6DD6'
  const intro = analysis.hasFrontMatter
    ? `<div class="component-source-note is-contract">
        <strong>Component contract</strong>
        <span>Rendered from YAML front matter. Component entries map token properties to preview styles.</span>
      </div>`
    : `<div class="component-source-note is-fallback">
        <strong>Markdown fallback</strong>
        <span>These previews are inferred from prose. Add YAML front matter <code>components:</code> entries to make them real DESIGN.md contract components.</span>
      </div>`
  componentsPreview.innerHTML = intro + components.map(component => component.source === 'frontmatter'
    ? renderSpecComponent(component, analysis.tokens, accent)
    : renderComponent(component, accent)).join('')
}

function renderSpecComponent(component, tokens, accent) {
  const resolved = {}
  const unresolved = []
  for (const [key, value] of Object.entries(component.props || {})) {
    const result = resolveTokenValue(value, tokens)
    resolved[key] = result.display
    unresolved.push(...result.unresolved)
  }
  const style = [
    resolved.backgroundColor && `--spec-bg:${escapeHtml(resolved.backgroundColor)}`,
    resolved.textColor && `--spec-fg:${escapeHtml(resolved.textColor)}`,
    resolved.rounded && `--spec-radius:${escapeHtml(resolved.rounded)}`,
    resolved.height && `--spec-height:${escapeHtml(resolved.height)}`,
    resolved.padding && `--spec-padding:${escapeHtml(resolved.padding)}`,
  ].filter(Boolean).join(';')
  return `<section class="component-card spec-component">
    ${componentHeader({ title: component.title }, 'Component token')}
    <div class="spec-demo" style="${style}">
      <button class="spec-button">${escapeHtml(component.title.replace(/\b(Primary|Secondary|Hover|Active|Disabled)\b/gi, '').trim() || component.title)}</button>
      <dl>${Object.entries(resolved).map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
      ${unresolved.length ? `<p class="component-warning">Unresolved: ${escapeHtml(unresolved.join(', '))}</p>` : ''}
    </div>
    ${componentDefinitionBlock(component.name, component.props, 'YAML definition')}
  </section>`
}

function renderIssues(analysis) {
  const findings = [...analysis.localIssues, ...(analysis.lintReport?.findings || [])]
  if (!findings.length) {
    issuesPreview.innerHTML = '<div class="issue-summary ready"><strong>No blocking issues</strong><span>This document has enough structure to act as a DESIGN.md contract.</span></div>'
    return
  }
  issuesPreview.innerHTML = `<div class="issue-summary ${findings.some(f => f.severity === 'error') ? 'error' : 'warning'}">
    <strong>${findings.length} issue${findings.length === 1 ? '' : 's'} found</strong>
    <span>Validation guides the document; saving remains available.</span>
  </div>
  <div class="issue-list">${findings.map(finding => `
    <div class="issue-row ${escapeHtml(finding.severity || 'info')}">
      <b>${escapeHtml(finding.severity || 'info')}</b>
      <div><strong>${escapeHtml(finding.path || 'document')}</strong><p>${escapeHtml(finding.message || '')}</p></div>
    </div>`).join('')}</div>`
}

function scheduleLint(analysis) {
  clearTimeout(lintTimer)
  const requestId = ++latestLintRequest
  lintTimer = setTimeout(async () => {
    if (!window.planAPI.lintDesignDoc) return
    const report = await window.planAPI.lintDesignDoc(analysis.raw)
    if (requestId !== latestLintRequest || editor.value !== analysis.raw) return
    activeAnalysis = { ...analyzeDesignDoc(editor.value), lintReport: report }
    renderIssues(activeAnalysis)
    if (activePreviewTab === 'document') renderDocument(activeAnalysis)
  }, 450)
}

function renderComponent(component, accent) {
  const kind = slug(component.title)
  if (/button/.test(kind)) return renderButtonComponent(component, accent)
  if (/(input|textarea|field)/.test(kind)) return renderInputComponent(component)
  if (/composer/.test(kind)) return renderComposerComponent(component, accent)
  if (/(toggle|switch|approve)/.test(kind)) return renderToggleComponent(component, accent)
  if (/(widget|card|container)/.test(kind)) return renderWidgetComponent(component, accent)
  if (/(preview|panel|inspector|editor)/.test(kind)) return renderPanelComponent(component, accent)
  return renderGenericComponent(component, accent)
}

function componentHeader(component, label = 'Component') {
  return `<header>
    <span class="component-kicker">${escapeHtml(label)}</span>
    <h3>${escapeHtml(component.title)}</h3>
  </header>`
}

function demoLabel(label) {
  return `<div class="demo-label">${escapeHtml(label)}</div>`
}

function renderButtonComponent(component, accent) {
  const variants = component.variants.length ? component.variants : ['Primary', 'Secondary', 'Ghost']
  const sizes = component.sizes.length ? component.sizes : ['Small', 'Medium', 'Large']
  const states = component.states.length ? component.states : ['Default', 'Hover', 'Disabled']
  return `<section class="component-card component-card--button">
    ${componentHeader(component)}
    <div class="component-demo">
      <div>${demoLabel('Variants')}<div class="demo-row">
        ${variants.map((variant, i) => `<button class="demo-button ${variantClass(variant, i)}" style="${/primary/i.test(variant) || i === 0 ? `--demo-accent:${escapeHtml(accent)}` : ''}">${escapeHtml(variant)}</button>`).join('')}
      </div></div>
      <div>${demoLabel('Sizes')}<div class="demo-row demo-row--baseline">
        ${sizes.map(size => `<button class="demo-button primary size-${sizeClass(size)}" style="--demo-accent:${escapeHtml(accent)}">${escapeHtml(size)}</button>`).join('')}
      </div></div>
      <div>${demoLabel('States')}<div class="demo-row">
        ${states.map(state => `<button class="demo-button ${stateClass(state)}" ${/disabled/i.test(state) ? 'disabled' : ''} style="${/loading|selected|active/i.test(state) ? `--demo-accent:${escapeHtml(accent)}` : ''}">${/loading/i.test(state) ? '<span class="button-loader" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>' : ''}${escapeHtml(state)}</button>`).join('')}
      </div></div>
    </div>
    ${componentMarkdownSource(component)}
  </section>`
}

function renderInputComponent(component) {
  const variants = component.variants.length ? component.variants : ['Default', 'With value', 'Disabled']
  return `<section class="component-card component-card--input">
    ${componentHeader(component)}
    <div class="component-demo">
      ${variants.map(variant => {
        const disabled = /disabled/i.test(variant)
        const value = /value/i.test(variant) ? 'Hello, world' : ''
        return `<label class="demo-field">
          <span>${escapeHtml(variant)}</span>
          <input class="demo-input" ${disabled ? 'disabled' : ''} value="${escapeHtml(value)}" placeholder="Placeholder text..." />
        </label>`
      }).join('')}
    </div>
    ${componentMarkdownSource(component)}
  </section>`
}

function renderComposerComponent(component, accent) {
  return `<section class="component-card component-card--composer">
    ${componentHeader(component, 'AI surface')}
    <div class="composer-preview" style="--demo-accent:${escapeHtml(accent)}">
      <div class="composer-rim"></div>
      <div class="composer-attachments">
        <span>logs-service.md</span>
        <span>dashboard.json</span>
      </div>
      <div class="composer-text">Ask Bits to investigate the spike in checkout latency...</div>
      <div class="composer-actions">
        <button class="demo-icon-button">＋</button>
        <button class="demo-icon-button">🎙</button>
        <span class="auto-toggle is-on"><b>Auto-approve</b><i></i></span>
        <button class="demo-button primary size-small" style="--demo-accent:${escapeHtml(accent)}">Send</button>
      </div>
    </div>
    ${componentMarkdownSource(component)}
  </section>`
}

function renderToggleComponent(component, accent) {
  return `<section class="component-card component-card--toggle">
    ${componentHeader(component, 'Control')}
    <div class="toggle-preview">
      <span class="auto-toggle"><b>Auto-approve</b><i></i></span>
      <span class="auto-toggle is-on" style="--demo-accent:${escapeHtml(accent)}"><b>Auto-approve</b><i></i></span>
      <span class="toggle-tooltip">Automatically approve all tool calls without requiring confirmation.</span>
    </div>
    ${componentMarkdownSource(component)}
  </section>`
}

function renderWidgetComponent(component, accent) {
  return `<section class="component-card component-card--widget">
    ${componentHeader(component, 'Surface')}
    <div class="widget-grid" style="--demo-accent:${escapeHtml(accent)}">
      <div class="demo-widget selected"><strong>Checkout latency</strong><span>p95 · 842ms</span><em>Investigating</em></div>
      <div class="demo-widget"><strong>Error rate</strong><span>0.42%</span><em>Normal</em></div>
      <div class="demo-widget error"><strong>Deploy health</strong><span>2 failing checks</span><em>Needs attention</em></div>
    </div>
    ${componentMarkdownSource(component)}
  </section>`
}

function renderPanelComponent(component, accent) {
  return `<section class="component-card component-card--panel">
    ${componentHeader(component, 'Panel')}
    <div class="panel-preview" style="--demo-accent:${escapeHtml(accent)}">
      <div class="panel-tabs"><span class="active">Overview</span><span>Components</span><span>Animations</span></div>
      <div class="panel-body">
        <div class="panel-section"><b>Button</b><p>Primary, secondary, ghost, and loading states.</p></div>
        <div class="panel-section"><b>Input</b><p>Default, value, focus, disabled, invalid.</p></div>
      </div>
    </div>
    ${componentMarkdownSource(component)}
  </section>`
}

function renderGenericComponent(component, accent) {
  return `<section class="component-card">
    ${componentHeader(component)}
    <div class="component-demo">
      <div>${demoLabel('Variants')}<div class="demo-row">
        ${component.variants.map((variant, i) => `<button class="demo-button ${variantClass(variant, i)}" style="${i === 0 ? `--demo-accent:${escapeHtml(accent)}` : ''}">${escapeHtml(variant)}</button>`).join('')}
      </div></div>
      <div>${demoLabel('States')}<div class="demo-row">
        ${component.states.map(state => `<span class="state-chip ${stateClass(state)}">${escapeHtml(state)}</span>`).join('')}
      </div></div>
    </div>
    ${componentMarkdownSource(component)}
  </section>`
}

function componentMarkdownSource(component) {
  if (!component.definition) return ''
  return `<details class="component-definition">
    <summary>Inferred from markdown</summary>
    <pre><code>${escapeHtml(component.definition)}</code></pre>
  </details>`
}

function componentDefinitionBlock(name, props, label = 'Definition') {
  const lines = ['components:', `  ${name}:`]
  for (const [key, value] of Object.entries(props || {})) {
    lines.push(`    ${key}: ${formatYamlValue(value)}`)
  }
  return `<details class="component-definition is-contract">
    <summary>${escapeHtml(label)}</summary>
    <pre><code>${escapeHtml(lines.join('\n'))}</code></pre>
  </details>`
}

function formatYamlValue(value) {
  if (value && typeof value === 'object') return JSON.stringify(value)
  const text = String(value ?? '')
  return /[:#{}[\],]|^\s|\s$/.test(text) ? JSON.stringify(text) : text
}

function variantClass(variant, index) {
  if (/danger|destructive|error/i.test(variant)) return 'danger'
  if (/ghost|link|text/i.test(variant)) return 'ghost'
  if (/secondary|neutral/i.test(variant)) return 'secondary'
  if (/primary|accent|main/i.test(variant) || index === 0) return 'primary'
  return 'secondary'
}

function sizeClass(size) {
  if (/xsmall|xs/i.test(size)) return 'xsmall'
  if (/small|sm/i.test(size)) return 'small'
  if (/large|lg/i.test(size)) return 'large'
  return 'medium'
}

function stateClass(state) {
  if (/disabled/i.test(state)) return 'disabled'
  if (/loading|thinking|streaming/i.test(state)) return 'loading secondary'
  if (/selected|active|focus|hover/i.test(state)) return 'selected secondary'
  if (/error|danger|invalid/i.test(state)) return 'danger'
  return 'secondary'
}

function setPreviewTab(tab) {
  activePreviewTab = tab
  previewTabs.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab))
  documentPreview.classList.toggle('hidden', tab !== 'document')
  tokensPreview.classList.toggle('hidden', tab !== 'tokens')
  componentsPreview.classList.toggle('hidden', tab !== 'components')
  issuesPreview.classList.toggle('hidden', tab !== 'issues')
}

function setTheme(nextTheme) {
  theme = nextTheme
  app.dataset.theme = theme
  themeBtn.textContent = theme === 'dark' ? 'Light' : 'Dark'
  setPrefs({ theme })
}

function setPaneMode(nextMode) {
  paneMode = paneMode === nextMode ? 'split' : nextMode
  app.dataset.paneMode = paneMode
}

function openPalette() {
  paletteIndex = 0
  palette.classList.remove('hidden')
  paletteInput.value = ''
  renderPalette()
  paletteInput.focus()
}

function closePalette() {
  palette.classList.add('hidden')
}

function setMoreMenuOpen(open) {
  moreActionsMenu.classList.toggle('hidden', !open)
  moreActionsBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
}

async function runMenuAction(action) {
  setMoreMenuOpen(false)
  await action()
}

function openNewDocModal() {
  const currentProject = activeFilename ? projectFromFilename(activeFilename) : (docs[0]?.project || 'local')
  newDocTitleInput.value = ''
  newDocProjectInput.value = currentProject
  newDocModal.classList.remove('hidden')
  requestAnimationFrame(() => newDocTitleInput.focus())
}

function closeNewDocModal() {
  newDocModal.classList.add('hidden')
}

function commandItems() {
  return [
    ...docs.map(doc => ({ type: 'doc', label: doc.title, detail: doc.filename, run: () => openDoc(doc.filename) })),
    { type: 'action', label: 'New design.md', detail: 'Create a new local document', run: () => openNewDocModal() },
    { type: 'action', label: 'Rename document', detail: 'Change the active document path', run: () => renameDoc() },
    { type: 'action', label: 'Delete document', detail: 'Remove the active local document', run: () => deleteDoc() },
    { type: 'action', label: 'Copy document path', detail: 'Copy absolute path for agent context', run: () => copyActiveDocPath() },
    { type: 'action', label: 'Copy agent prompt', detail: 'Copy instruction that points an agent at this design.md', run: () => copyAgentInstruction() },
    { type: 'action', label: 'Reveal in Finder', detail: 'Open the active design.md location', run: () => revealActiveDoc() },
    { type: 'action', label: 'Show issues', detail: 'Open DESIGN.md validation findings', run: () => setPreviewTab('issues') },
    { type: 'action', label: 'Export token JSON', detail: 'Copy DTCG token JSON to clipboard', run: () => exportDesign('dtcg') },
    { type: 'action', label: 'Export Tailwind config', detail: 'Copy Tailwind theme extension to clipboard', run: () => exportDesign('tailwind') },
    { type: 'action', label: 'Toggle theme', detail: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { type: 'action', label: 'Focus editor', detail: 'Move cursor to markdown editor', run: () => editor.focus() },
    { type: 'action', label: 'Focus preview', detail: 'Move focus to live preview', run: () => previewScroll.focus() },
  ]
}

function renderPalette() {
  const q = paletteInput.value.trim().toLowerCase()
  paletteItems = commandItems().filter(item => !q || `${item.label} ${item.detail}`.toLowerCase().includes(q))
  if (paletteIndex >= paletteItems.length) paletteIndex = Math.max(0, paletteItems.length - 1)
  paletteList.innerHTML = paletteItems.map((item, i) => `
    <li class="palette-item ${i === paletteIndex ? 'active' : ''}" data-index="${i}">
      <span>${item.type === 'doc' ? '#' : '⌘'}</span>
      <strong>${escapeHtml(item.label)}</strong>
      <em>${escapeHtml(item.detail)}</em>
    </li>`).join('') || '<li class="palette-empty">No results.</li>'
}

function setPaletteActive(index) {
  paletteIndex = index
  paletteList.querySelectorAll('.palette-item').forEach((item, i) => {
    item.classList.toggle('active', i === paletteIndex)
  })
}

function runPaletteItem(index = paletteIndex) {
  const item = paletteItems[index]
  if (!item) return
  item.run()
  closePalette()
}

async function createDoc() {
  const title = newDocTitleInput.value.trim()
  if (!title) return
  const project = newDocProjectInput.value.trim() || 'local'
  const filename = await window.planAPI.createDesignDoc(project, title)
  if (!filename) return setToast('Could not create document')
  closeNewDocModal()
  docs = (await window.planAPI.getDesignDocs()).map(normalizeDoc)
  await openDoc(filename)
  setToast('Document created')
}

async function renameDoc() {
  if (!activeFilename) return
  const next = prompt('Rename file path', activeFilename)
  if (!next || next === activeFilename) return
  const filename = await window.planAPI.renameDesignDoc(activeFilename, next)
  if (!filename) return setToast('Could not rename document')
  docs = (await window.planAPI.getDesignDocs()).map(normalizeDoc)
  await openDoc(filename)
  setToast('Document renamed')
}

async function deleteDoc() {
  if (!activeFilename || !confirm(`Delete ${activeFilename}?`)) return
  const ok = await window.planAPI.deleteDesignDoc(activeFilename)
  if (!ok) return setToast('Could not delete document')
  docs = (await window.planAPI.getDesignDocs()).map(normalizeDoc)
  activeFilename = null
  editor.value = ''
  renderDocLists()
  if (docs[0]) await openDoc(docs[0].filename)
  setToast('Document deleted')
}

async function activeDocPath() {
  if (!activeFilename) return null
  const current = docs.find(doc => doc.filename === activeFilename)
  if (current?.path) return current.path
  return window.planAPI.getDesignDocPath ? window.planAPI.getDesignDocPath(activeFilename) : null
}

async function copyActiveDocPath() {
  const filepath = await activeDocPath()
  if (!filepath) return setToast('No local path available')
  await navigator.clipboard.writeText(filepath).catch(() => {})
  setToast('Path copied')
}

async function copyAgentInstruction() {
  const filepath = await activeDocPath()
  if (!filepath) return setToast('No local path available')
  const title = titleFromMarkdown(editor.value, activeFilename || 'DESIGN.md')
  const instruction = `Before making UI or styling changes, read and follow this DESIGN.md contract:\n${filepath}\n\nUse it as the source of truth for tokens, component behavior, visual style, and implementation guidance for "${title}".`
  await navigator.clipboard.writeText(instruction).catch(() => {})
  setToast('Agent prompt copied')
}

async function revealActiveDoc() {
  if (!activeFilename || !window.planAPI.revealDesignDoc) return setToast('Reveal unavailable')
  const ok = await window.planAPI.revealDesignDoc(activeFilename)
  setToast(ok ? 'Revealed in Finder' : 'Could not reveal document')
}

editor.addEventListener('input', () => {
  activeContent = editor.value
  activeTitle.textContent = titleFromMarkdown(activeContent, activeFilename || 'design.md')
  updateAll()
  scheduleSave()
})

editor.addEventListener('scroll', () => {
  lineNumbers.scrollTop = editor.scrollTop
  if (!syncScrollToggle.checked || syncingScroll) return
  syncingScroll = true
  const maxEditor = editor.scrollHeight - editor.clientHeight
  const maxPreview = previewScroll.scrollHeight - previewScroll.clientHeight
  previewScroll.scrollTop = maxEditor > 0 ? (editor.scrollTop / maxEditor) * maxPreview : 0
  syncingScroll = false
})

previewScroll.addEventListener('scroll', () => {
  if (!syncScrollToggle.checked || syncingScroll) return
  syncingScroll = true
  const maxPreview = previewScroll.scrollHeight - previewScroll.clientHeight
  const maxEditor = editor.scrollHeight - editor.clientHeight
  editor.scrollTop = maxPreview > 0 ? (previewScroll.scrollTop / maxPreview) * maxEditor : 0
  lineNumbers.scrollTop = editor.scrollTop
  syncingScroll = false
})

docList.addEventListener('click', e => {
  const row = e.target.closest('.doc-row')
  if (row) openDoc(row.dataset.filename)
})

previewTabs.forEach(tab => tab.addEventListener('click', () => setPreviewTab(tab.dataset.tab)))
newDocBtn.addEventListener('click', openNewDocModal)
newDocForm.addEventListener('submit', e => {
  e.preventDefault()
  createDoc()
})
newDocCancel.addEventListener('click', closeNewDocModal)
newDocModal.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) closeNewDocModal()
})
renameDocBtn.addEventListener('click', () => runMenuAction(renameDoc))
deleteDocBtn.addEventListener('click', () => runMenuAction(deleteDoc))
saveBtn.addEventListener('click', () => saveNow().then(() => setToast('Saved')))
copyPathBtn.addEventListener('click', () => runMenuAction(copyActiveDocPath))
agentInstructionBtn.addEventListener('click', () => runMenuAction(copyAgentInstruction))
revealDocBtn.addEventListener('click', () => runMenuAction(revealActiveDoc))
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(editor.value).catch(() => {})
  setToast('design.md copied')
})
exportJsonBtn.addEventListener('click', () => runMenuAction(() => exportDesign('dtcg')))
exportTailwindBtn.addEventListener('click', () => runMenuAction(() => exportDesign('tailwind')))
themeBtn.addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark'))
commandBtn.addEventListener('click', openPalette)
moreActionsBtn.addEventListener('click', e => {
  e.stopPropagation()
  const isOpen = !moreActionsMenu.classList.contains('hidden')
  setMoreMenuOpen(!isOpen)
})
editorFullBtn.addEventListener('click', () => setPaneMode('editor'))
previewFullBtn.addEventListener('click', () => setPaneMode('preview'))
sidebarToggle.addEventListener('click', () => app.classList.toggle('rail-hidden'))

paletteInput.addEventListener('input', () => { paletteIndex = 0; renderPalette() })
paletteInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    paletteIndex = Math.min(paletteIndex + 1, paletteItems.length - 1)
    renderPalette()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    paletteIndex = Math.max(paletteIndex - 1, 0)
    renderPalette()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    runPaletteItem()
  } else if (e.key === 'Escape') {
    closePalette()
  }
})
paletteList.addEventListener('pointermove', e => {
  const item = e.target.closest('.palette-item')
  if (!item) return
  setPaletteActive(Number(item.dataset.index))
})
paletteList.addEventListener('click', e => {
  const item = e.target.closest('.palette-item')
  if (item) runPaletteItem(Number(item.dataset.index))
})
paletteBackdrop.addEventListener('click', closePalette)
document.addEventListener('click', e => {
  if (!e.target.closest('.more-menu')) setMoreMenuOpen(false)
})

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    openPalette()
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    saveNow().then(() => setToast('Saved'))
  }
  if (e.key === 'Escape' && !palette.classList.contains('hidden')) closePalette()
})

async function init() {
  const prefs = getPrefs()
  setTheme(prefs.theme || 'dark')
  await loadDocs()
  setPreviewTab('document')
}

init().catch(err => {
  console.error(err)
  setToast('Could not load design docs')
})

async function exportDesign(format) {
  if (!activeAnalysis) activeAnalysis = analyzeDesignDoc(editor.value)
  if (!activeAnalysis.hasFrontMatter || activeAnalysis.frontMatterError) {
    setPreviewTab('issues')
    setToast('Add valid front matter before exporting')
    return
  }
  if (!window.planAPI.exportDesignDoc) {
    const data = format === 'dtcg' ? activeAnalysis.tokens : { theme: { extend: activeAnalysis.tokenGroups } }
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).catch(() => {})
    setToast(`${format === 'dtcg' ? 'Token JSON' : 'Tailwind'} copied`)
    return
  }
  const result = await window.planAPI.exportDesignDoc(editor.value, format)
  if (!result?.ok) {
    setPreviewTab('issues')
    setToast(result?.message || 'Export unavailable')
    return
  }
  navigator.clipboard.writeText(JSON.stringify(result.data, null, 2)).catch(() => {})
  setToast(`${format === 'dtcg' ? 'Token JSON' : 'Tailwind'} copied`)
}
