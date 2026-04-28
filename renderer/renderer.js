// Split-pane design.md editor

let docs = []
let activeFilename = null
let activeContent = ''
let dirty = false
let saveTimer = null
let paletteIndex = 0
let paletteItems = []
let recentFiles = []
let paneMode = 'split'
let activePreviewTab = 'document'
let theme = 'dark'
let syncingScroll = false

const app = document.getElementById('app')
const docList = document.getElementById('doc-list')
const recentList = document.getElementById('recent-list')
const newDocBtn = document.getElementById('new-doc-btn')
const importPlaceholderBtn = document.getElementById('import-placeholder-btn')
const renameDocBtn = document.getElementById('rename-doc-btn')
const deleteDocBtn = document.getElementById('delete-doc-btn')
const sidebarToggle = document.getElementById('sidebar-toggle')
const activeTitle = document.getElementById('active-title')
const commandBtn = document.getElementById('command-btn')
const themeBtn = document.getElementById('theme-btn')
const saveBtn = document.getElementById('save-btn')
const copyBtn = document.getElementById('copy-btn')
const editorFullBtn = document.getElementById('editor-full-btn')
const previewFullBtn = document.getElementById('preview-full-btn')
const editor = document.getElementById('markdown-editor')
const lineNumbers = document.getElementById('line-numbers')
const documentPreview = document.getElementById('document-preview')
const tokensPreview = document.getElementById('tokens-preview')
const componentsPreview = document.getElementById('components-preview')
const previewScroll = document.getElementById('preview-scroll')
const previewTabs = [...document.querySelectorAll('.preview-tab')]
const saveState = document.getElementById('save-state')
const stats = document.getElementById('stats')
const syncScrollToggle = document.getElementById('sync-scroll')
const palette = document.getElementById('palette')
const paletteInput = document.getElementById('palette-input')
const paletteList = document.getElementById('palette-list')
const paletteBackdrop = document.getElementById('palette-backdrop')
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
  return {
    filename: doc.filename,
    title: doc.title || titleFromMarkdown('', doc.filename),
    project: doc.project || doc.repo || projectFromFilename(doc.filename),
    modified: doc.modified || new Date().toISOString(),
    summary: doc.summary || '',
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
  rememberFile(filename)
  renderDocLists()
  updateAll()
  setSaveState('Saved')
}

function rememberFile(filename) {
  recentFiles = [filename, ...recentFiles.filter(item => item !== filename)].slice(0, 5)
}

function renderDocLists() {
  const grouped = new Map()
  docs.forEach(doc => {
    const group = doc.project || projectFromFilename(doc.filename)
    if (!grouped.has(group)) grouped.set(group, [])
    grouped.get(group).push(doc)
  })

  docList.innerHTML = [...grouped.entries()].map(([project, projectDocs]) => `
    <div class="doc-group">
      <button class="doc-group-title" data-project="${escapeHtml(project)}">▾ ${escapeHtml(project)}</button>
      ${projectDocs.map(docRow).join('')}
    </div>
  `).join('') || '<div class="empty-list">No design docs yet.</div>'

  recentList.innerHTML = recentFiles
    .map(filename => docs.find(doc => doc.filename === filename))
    .filter(Boolean)
    .map(doc => `<button class="recent-row" data-filename="${escapeHtml(doc.filename)}">${escapeHtml(doc.title)}</button>`)
    .join('') || '<div class="empty-list">No recent files.</div>'
}

function docRow(doc) {
  const active = doc.filename === activeFilename ? ' active' : ''
  return `<button class="doc-row${active}" data-filename="${escapeHtml(doc.filename)}">
    <span class="doc-icon">#</span>
    <span>
      <strong>${escapeHtml(doc.title)}</strong>
      <em>${escapeHtml(doc.filename)}</em>
    </span>
  </button>`
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

function parseTokens(content) {
  const tokens = []
  const tokenText = sectionContent(content, 'Tokens')
  for (const line of tokenText.split('\n')) {
    const match = line.match(/^\s*[-*]?\s*([^:]+):\s*(.+)$/)
    if (!match) continue
    const name = match[1].replace(/[`*_]/g, '').trim()
    const value = match[2].replace(/[`*_]/g, '').trim()
    let type = 'text'
    if (/(#[0-9a-f]{3,8}\b|rgba?\(|hsla?\()/i.test(value)) type = 'color'
    else if (/\b\d+(\.\d+)?(px|rem|em|%)\b/i.test(value)) type = 'size'
    else if (/font|type|weight|leading|tracking/i.test(name)) type = 'type'
    tokens.push({ name, value, type })
  }
  return tokens
}

function parseComponents(content) {
  const componentText = sectionContent(content, '(Components|Components And Patterns|Patterns)')
  if (!componentText) return []
  const chunks = componentText.split(/(?=^###\s+)/m).filter(Boolean)
  return chunks.map(chunk => {
    const title = chunk.match(/^###\s+(.+)$/m)?.[1]?.trim() || 'Component'
    const variants = chunk.match(/Variants?:\s*(.+)$/im)?.[1]?.split(/,\s*/).filter(Boolean) || ['Primary', 'Secondary', 'Ghost']
    const sizes = chunk.match(/Sizes?:\s*(.+)$/im)?.[1]?.split(/,\s*/).filter(Boolean) || ['Small', 'Medium', 'Large']
    const states = chunk.match(/States?:\s*(.+)$/im)?.[1]?.split(/,\s*/).filter(Boolean) || ['Default', 'Hover', 'Disabled']
    return { title, variants, sizes, states, body: chunk.replace(/^###\s+.+$/m, '').trim() }
  })
}

function renderPreview() {
  const content = editor.value
  documentPreview.innerHTML = marked.parse(content)
  renderTokens(parseTokens(content))
  renderComponents(parseComponents(content), parseTokens(content))
}

function renderTokens(tokens) {
  if (!tokens.length) {
    tokensPreview.innerHTML = '<div class="preview-empty">Add a <code>## Tokens</code> section with bullets like <code>- Accent: #5E6DD6</code>.</div>'
    return
  }
  tokensPreview.innerHTML = `<div class="preview-section-title">Detected tokens</div>
    <div class="token-grid">${tokens.map(token => `
      <div class="token-card">
        <span class="token-swatch ${token.type}" style="${token.type === 'color' ? `background:${escapeHtml(token.value)}` : ''}"></span>
        <div>
          <strong>${escapeHtml(token.name)}</strong>
          <code>${escapeHtml(token.value)}</code>
        </div>
      </div>`).join('')}</div>`
}

function renderComponents(components, tokens) {
  if (!components.length) {
    componentsPreview.innerHTML = '<div class="preview-empty">Add <code>## Components</code> and <code>### Button</code> sections to generate component previews.</div>'
    return
  }
  const accent = tokens.find(token => /accent|primary/i.test(token.name) && token.type === 'color')?.value || '#5E6DD6'
  componentsPreview.innerHTML = components.map(component => renderComponent(component, accent)).join('')
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
  </section>`
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

function commandItems() {
  return [
    ...docs.map(doc => ({ type: 'doc', label: doc.title, detail: doc.filename, run: () => openDoc(doc.filename) })),
    { type: 'action', label: 'New design.md', detail: 'Create a new local document', run: () => createDoc() },
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

function runPaletteItem(index = paletteIndex) {
  const item = paletteItems[index]
  if (!item) return
  item.run()
  closePalette()
}

async function createDoc() {
  const title = prompt('Document title?', 'New Design Language')
  if (!title) return
  const project = prompt('Project folder?', 'local') || 'local'
  const filename = await window.planAPI.createDesignDoc(project, title)
  if (!filename) return setToast('Could not create document')
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

recentList.addEventListener('click', e => {
  const row = e.target.closest('.recent-row')
  if (row) openDoc(row.dataset.filename)
})

previewTabs.forEach(tab => tab.addEventListener('click', () => setPreviewTab(tab.dataset.tab)))
newDocBtn.addEventListener('click', createDoc)
importPlaceholderBtn.addEventListener('click', createDoc)
renameDocBtn.addEventListener('click', renameDoc)
deleteDocBtn.addEventListener('click', deleteDoc)
saveBtn.addEventListener('click', () => saveNow().then(() => setToast('Saved')))
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(editor.value).catch(() => {})
  setToast('design.md copied')
})
themeBtn.addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark'))
commandBtn.addEventListener('click', openPalette)
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
  paletteIndex = Number(item.dataset.index)
  renderPalette()
})
paletteList.addEventListener('click', e => {
  const item = e.target.closest('.palette-item')
  if (item) runPaletteItem(Number(item.dataset.index))
})
paletteBackdrop.addEventListener('click', closePalette)

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
