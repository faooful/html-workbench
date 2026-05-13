// HTML Workbench

let files = []
let activeFilePath = null
let dirty = false
let editVersion = 0
let saveTimer = null
let previewTimer = null
let paletteIndex = 0
let paletteItems = []
let paneMode = 'split'
let theme = 'dark'
let watchDir = null
let autosaveEnabled = true
let autosaveDelayMs = 1000
let previewFont = 'system'
let slashOpen = false
let slashIndex = 0
let slashQuery = ''
let slashStart = -1
let slashItems = []

const AUTOSAVE_DELAYS = [1000, 3000, 5000, 10000]
const PREVIEW_FONTS = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  sans: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"Geist Mono Variable", "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
  georgia: 'Georgia, Cambria, "Times New Roman", Times, serif',
}
const HTML_TAGS = ['a', 'article', 'aside', 'b', 'blockquote', 'br', 'button', 'canvas', 'code', 'div', 'em', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'input', 'label', 'li', 'main', 'nav', 'ol', 'option', 'p', 'pre', 'section', 'select', 'span', 'strong', 'table', 'tbody', 'td', 'textarea', 'th', 'thead', 'tr', 'ul']
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input'])
const TAG_COMPLETIONS = {
  a: { text: '<a href=""></a>', caretOffset: 9 },
  button: { text: '<button type="button"></button>', caretOffset: 22 },
  img: { text: '<img src="" alt="" />', caretOffset: 10 },
  input: { text: '<input type="text" />', caretOffset: 13 },
}
const PLAN_SNIPPET = `<article class="agent-plan">
  <h1>Plan Title</h1>

  <section>
    <h2>Goal</h2>
    <p>Describe the outcome this work should achieve.</p>
  </section>

  <section>
    <h2>Context</h2>
    <p>Capture the current state, constraints, and relevant background.</p>
  </section>

  <section>
    <h2>Requirements</h2>
    <ul>
      <li>Requirement one</li>
      <li>Requirement two</li>
    </ul>
  </section>

  <section data-prototype="true">
    <h2>Prototype</h2>
    <p>Replace this with a simple inline HTML prototype.</p>
  </section>

  <section>
    <h2>Implementation Notes</h2>
    <p>Call out important files, data flow, edge cases, or sequencing.</p>
  </section>

  <section>
    <h2>Acceptance Criteria</h2>
    <ul>
      <li>Expected behavior is verifiable.</li>
      <li>Relevant checks pass.</li>
    </ul>
  </section>

  <section>
    <h2>Open Questions</h2>
    <ul>
      <li>Question to resolve before implementation.</li>
    </ul>
  </section>
</article>`
const PROTOTYPE_SNIPPET = `<section data-prototype="true">
  <h2>Prototype</h2>
  <div class="prototype-surface">
    <h3>Prototype state</h3>
    <p>Describe or build the UI state the implementing agent should understand.</p>
    <button type="button">Primary action</button>
  </div>
</section>`
const SLASH_COMMANDS = [
  { key: 'plan', label: 'Agent plan scaffold', aliases: ['brief', 'handoff', 'spec'], snippet: PLAN_SNIPPET },
  { key: 'prototype', label: 'Prototype block', aliases: ['proto', 'mockup'], snippet: PROTOTYPE_SNIPPET },
  { key: 'requirements', label: 'Requirements section', aliases: ['reqs'], snippet: '<section>\n  <h2>Requirements</h2>\n  <ul>\n    <li>Requirement one</li>\n  </ul>\n</section>' },
  { key: 'acceptance', label: 'Acceptance criteria', aliases: ['criteria', 'done'], snippet: '<section>\n  <h2>Acceptance Criteria</h2>\n  <ul>\n    <li>Expected behavior is verifiable.</li>\n  </ul>\n</section>' },
  { key: 'questions', label: 'Open questions', aliases: ['open'], snippet: '<section>\n  <h2>Open Questions</h2>\n  <ul>\n    <li>Question to resolve.</li>\n  </ul>\n</section>' },
  { key: 'notes', label: 'Implementation notes', aliases: ['implementation'], snippet: '<section>\n  <h2>Implementation Notes</h2>\n  <p>Important implementation context.</p>\n</section>' },
  { key: 'decision', label: 'Decision record', aliases: ['adr', 'choice'], snippet: '<section>\n  <h2>Decision</h2>\n  <p><strong>Decision:</strong> Chosen approach.</p>\n  <p><strong>Reason:</strong> Why this is the right tradeoff.</p>\n</section>' },
  { key: 'todo', label: 'Todo list', aliases: ['tasks', 'checklist'], snippet: '<section>\n  <h2>Todo</h2>\n  <ul>\n    <li>Task one</li>\n  </ul>\n</section>' },
  { key: 'h1', label: 'Heading 1', aliases: ['heading', 'title'], snippet: '<h1>Heading</h1>' },
  { key: 'h2', label: 'Heading 2', aliases: ['subheading'], snippet: '<h2>Heading</h2>' },
  { key: 'p', label: 'Paragraph', aliases: ['text'], snippet: '<p>Paragraph text</p>' },
  { key: 'ul', label: 'Bulleted list', aliases: ['list', 'unordered'], snippet: '<ul>\n  <li>First item</li>\n  <li>Second item</li>\n</ul>' },
  { key: 'ol', label: 'Numbered list', aliases: ['ordered'], snippet: '<ol>\n  <li>First item</li>\n  <li>Second item</li>\n</ol>' },
  { key: 'quote', label: 'Quote', aliases: ['blockquote'], snippet: '<blockquote>\n  <p>Quote text</p>\n</blockquote>' },
  { key: 'table', label: 'Table', aliases: ['grid'], snippet: '<table>\n  <thead>\n    <tr><th>Column</th><th>Column</th></tr>\n  </thead>\n  <tbody>\n    <tr><td>Value</td><td>Value</td></tr>\n  </tbody>\n</table>' },
  { key: 'image', label: 'Image', aliases: ['img', 'picture'], snippet: '<img src=\"\" alt=\"\" />' },
  { key: 'button', label: 'Button', aliases: ['cta'], snippet: '<button type=\"button\">Button</button>' },
  { key: 'card', label: 'Card', aliases: ['panel'], snippet: '<section class=\"card\">\n  <h2>Card title</h2>\n  <p>Card content</p>\n</section>' },
  { key: 'section', label: 'Section', aliases: ['block'], snippet: '<section>\n  <h2>Section title</h2>\n  <p>Section content</p>\n</section>' },
  { key: 'canvas', label: 'Canvas placeholder', aliases: ['drawing'], snippet: '<section class=\"canvas-block\" data-prototype=\"true\">\n  <h2>Canvas Prototype</h2>\n  <canvas width=\"640\" height=\"360\" aria-label=\"Canvas placeholder\"></canvas>\n</section>' },
]

const app        = document.getElementById('app')
const docList    = document.getElementById('doc-list')
const planMap    = document.getElementById('plan-map')
const newDocBtn  = document.getElementById('new-doc-btn')
const sidebarToggle   = document.getElementById('sidebar-toggle')
const activeTitle     = document.getElementById('active-title')
const activeRenameBtn = document.getElementById('active-rename-btn')
const commandBtn      = document.getElementById('command-btn')
const themeBtn        = document.getElementById('theme-btn')
const saveBtn         = document.getElementById('save-btn')
const openBrowserBtn  = document.getElementById('open-browser-btn')
const copyBriefBtn    = document.getElementById('copy-brief-btn')
const copyPathBtn     = document.getElementById('copy-path-btn')
const copyBriefMenuBtn = document.getElementById('copy-brief-menu-btn')
const revealDocBtn    = document.getElementById('reveal-doc-btn')
const renameDocBtn    = document.getElementById('rename-doc-btn')
const deleteDocBtn    = document.getElementById('delete-doc-btn')
const moreActionsBtn  = document.getElementById('more-actions-btn')
const moreActionsMenu = document.getElementById('more-actions-menu')
const editorFullBtn   = document.getElementById('editor-full-btn')
const previewFullBtn  = document.getElementById('preview-full-btn')
const editor          = document.getElementById('html-editor')
const lineNumbers     = document.getElementById('line-numbers')
const previewFrame    = document.getElementById('preview-frame')
const slashMenu       = document.getElementById('slash-menu')
const slashList       = document.getElementById('slash-list')
const saveState       = document.getElementById('save-state')
const stats           = document.getElementById('stats')
const watchDirLabel   = document.getElementById('watch-dir-label')
const autosaveCheckbox = document.getElementById('autosave-checkbox')
const autosaveDelayBtn = document.getElementById('autosave-delay-btn')
const palette         = document.getElementById('palette')
const paletteInput    = document.getElementById('palette-input')
const paletteList     = document.getElementById('palette-list')
const paletteBackdrop = document.getElementById('palette-backdrop')
const newDocModal     = document.getElementById('new-doc-modal')
const newDocForm      = document.getElementById('new-doc-form')
const newDocTitleInput = document.getElementById('new-doc-title-input')
const newDocCancel    = document.getElementById('new-doc-cancel')
const toast           = document.getElementById('toast')

function esc(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function textOnly(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function plainText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function lineForIndex(source, index) {
  return source.slice(0, index).split('\n').length
}

function relativeTime(ms) {
  const d = Date.now() - ms
  if (d < 60000) return 'just now'
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return `${Math.floor(d / 86400000)}d ago`
}

function inferTitleFromContent(content) {
  const raw = String(content || '')
  const title = raw.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
  const heading = raw.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1]
  const firstLine = raw.split('\n').find(line => line.trim())
  const candidate = title || heading || firstLine || 'Untitled'
  return candidate
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64) || 'Untitled'
}

function getPrefs() {
  try { return JSON.parse(localStorage.getItem('htmlWorkbenchPrefs') || '{}') } catch (_) { return {} }
}

function setPrefs(next) {
  localStorage.setItem('htmlWorkbenchPrefs', JSON.stringify({ ...getPrefs(), ...next }))
}

function setToast(msg) {
  toast.textContent = msg
  toast.classList.add('visible')
  clearTimeout(setToast._t)
  setToast._t = setTimeout(() => toast.classList.remove('visible'), 1800)
}

function setSaveState(label, mode = '') {
  saveState.textContent = label
  saveState.dataset.mode = mode
}

function formatDelay(ms) {
  return `${Math.round(ms / 1000)}s`
}

function normalizeDelay(ms) {
  return AUTOSAVE_DELAYS.includes(ms) ? ms : 1000
}

function normalizePreviewFont(next) {
  return PREVIEW_FONTS[next] ? next : 'system'
}

function previewThemeStyle() {
  const isDark = theme === 'dark'
  const bg = isDark ? '#151515' : '#ffffff'
  const fg = isDark ? '#f5f5f5' : '#1a1a1a'
  const border = isDark ? '#3a3a3a' : '#d8d8d8'
  const font = PREVIEW_FONTS[previewFont] || PREVIEW_FONTS.system
  return `<style data-html-workbench-preview>
html, body {
  background: ${bg};
  color: ${fg};
  font-family: ${font};
}
body {
  margin: 0;
}
table {
  border-collapse: collapse;
}
th, td {
  border: 1px solid ${border};
  padding: 8px 10px;
}
.canvas-block canvas {
  display: block;
  width: min(100%, 640px);
  height: auto;
  min-height: 240px;
  border: 1px dashed ${border};
  background: ${isDark ? '#202020' : '#f7f7f7'};
}
[data-prototype] {
  position: relative;
  margin: 24px 0;
  padding: 18px;
  border: 1px dashed ${border};
  border-radius: 10px;
  background: ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)'};
}
[data-prototype]::before {
  content: "Prototype";
  display: inline-block;
  margin: 0 0 10px;
  color: ${isDark ? '#93c5fd' : '#2563eb'};
  font: 700 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.prototype-surface {
  padding: 18px;
  border: 1px solid ${border};
  border-radius: 8px;
  background: ${isDark ? '#1f1f1f' : '#ffffff'};
}
</style>`
}

function buildPreviewSrcdoc(content) {
  const source = String(content || '')
  const style = previewThemeStyle()
  if (/<html[\s>]/i.test(source)) {
    if (/<head[\s>]/i.test(source)) return source.replace(/<head([^>]*)>/i, `<head$1>${style}`)
    return source.replace(/<html([^>]*)>/i, `<html$1><head>${style}</head>`)
  }
  return `<!DOCTYPE html><html><head>${style}</head><body>${source}</body></html>`
}

function syncAutosaveControls() {
  autosaveCheckbox.checked = autosaveEnabled
  autosaveDelayBtn.textContent = formatDelay(autosaveDelayMs)
  autosaveDelayBtn.disabled = !autosaveEnabled
  autosaveDelayBtn.title = autosaveEnabled ? 'Cycle autosave interval' : 'Autosave is off'
}

function setAutosaveEnabled(next) {
  autosaveEnabled = Boolean(next)
  setPrefs({ autosaveEnabled })
  syncAutosaveControls()
  clearTimeout(saveTimer)
  if (dirty) {
    setSaveState('Unsaved', 'dirty')
    scheduleSave()
  }
}

function cycleAutosaveDelay() {
  const index = AUTOSAVE_DELAYS.indexOf(autosaveDelayMs)
  autosaveDelayMs = AUTOSAVE_DELAYS[(index + 1) % AUTOSAVE_DELAYS.length]
  setPrefs({ autosaveDelayMs })
  syncAutosaveControls()
  if (dirty) scheduleSave()
}

// ── File list ──────────────────────────────────────────────

async function loadFiles() {
  if (!watchDir) watchDir = await window.htmlAPI.getWatchDir()
  if (!watchDir) {
    renderDocList()
    return
  }
  files = await window.htmlAPI.listHtmlFiles(watchDir)
  renderDocList()
  const prefs = getPrefs()
  const target = files.find(f => f.path === prefs.lastFilePath) || files[0]
  if (target) await openFile(target.path)
}

async function openFile(filePath) {
  if (dirty) {
    const saved = await saveNow({ allowCreate: true })
    if (!saved) return
  }
  clearTimeout(saveTimer)
  const content = await window.htmlAPI.readFile(filePath)
  if (content == null) return
  activeFilePath = filePath
  dirty = false
  editVersion = 0
  editor.value = content
  const file = files.find(f => f.path === filePath)
  activeTitle.textContent = file?.title || (file?.name?.replace(/\.html$/, '') || 'Untitled')
  setPrefs({ lastFilePath: filePath })
  renderDocList()
  updateLineNumbers()
  updateStats()
  renderPlanMap()
  updatePreview()
  setSaveState('Saved')
}

function renderDocList() {
  if (!watchDir) {
    docList.innerHTML = '<div class="empty-list">Preparing library…</div>'
    return
  }
  if (!files.length) {
    docList.innerHTML = '<div class="empty-list">No HTML files here yet.</div>'
    return
  }
  docList.innerHTML = files.map(file => {
    const active = file.path === activeFilePath ? ' active' : ''
    const name = file.name.replace(/\.html$/, '')
    const sub = relativeTime(file.mtime)
    return `<div class="doc-row${active}" data-path="${esc(file.path)}">
      <button class="doc-open-btn" data-path="${esc(file.path)}">
        <span class="doc-icon">H</span>
        <span>
          <strong>${esc(name)}</strong>
          <em>${esc(sub)}</em>
        </span>
      </button>
      <button class="doc-rename-btn" data-path="${esc(file.path)}" title="Rename ${esc(name)}" aria-label="Rename ${esc(name)}">✎</button>
    </div>`
  }).join('')
}

function getPlanMapItems() {
  const source = editor.value
  const items = []
  const headingPattern = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi
  let match
  while ((match = headingPattern.exec(source))) {
    items.push({
      type: 'heading',
      level: Number(match[1]),
      label: textOnly(match[2]) || `Heading ${match[1]}`,
      index: match.index,
      line: lineForIndex(source, match.index),
    })
  }

  const prototypePattern = /<([a-z0-9-]+)\b[^>]*\bdata-prototype(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*>/gi
  while ((match = prototypePattern.exec(source))) {
    const labelMatch = source.slice(match.index, match.index + 900).match(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/i)
    items.push({
      type: 'prototype',
      level: 2,
      label: labelMatch ? textOnly(labelMatch[2]) : 'Prototype',
      index: match.index,
      line: lineForIndex(source, match.index),
    })
  }

  return items
    .sort((a, b) => a.index - b.index || (a.type === 'prototype' ? 1 : -1))
    .filter((item, index, list) => {
      const prev = list[index - 1]
      return !(prev && prev.index === item.index && prev.type === item.type && prev.label === item.label)
    })
}

function renderPlanMap() {
  if (!planMap) return
  const items = getPlanMapItems()
  if (!editor.value.trim()) {
    planMap.innerHTML = '<div class="empty-list">Use /plan to start a handoff doc.</div>'
    return
  }
  if (!items.length) {
    planMap.innerHTML = '<div class="empty-list">No headings yet.</div>'
    return
  }
  planMap.innerHTML = items.map(item => `
    <button class="plan-map-item level-${item.level}" data-index="${item.index}" title="Line ${item.line}">
      <span>${item.type === 'prototype' ? 'P' : `H${item.level}`}</span>
      <strong>${esc(item.label)}</strong>
    </button>`).join('')
}

async function refreshFileList() {
  if (!watchDir) return
  files = await window.htmlAPI.listHtmlFiles(watchDir)
  const file = files.find(f => f.path === activeFilePath)
  if (file) activeTitle.textContent = file.title || file.name.replace(/\.html$/, '') || 'Untitled'
  renderDocList()
}

// ── Editor ─────────────────────────────────────────────────

function updateLineNumbers() {
  const count = Math.max(1, editor.value.split('\n').length)
  lineNumbers.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n')
}

function updateStats() {
  const lines = Math.max(1, editor.value.split('\n').length)
  stats.textContent = `Lines: ${lines.toLocaleString()}`
}

function schedulePreview() {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(updatePreview, 300)
}

function updatePreview() {
  previewFrame.srcdoc = buildPreviewSrcdoc(editor.value)
  requestAnimationFrame(bindPreviewMenuClose)
}

function insertSnippet(snippet) {
  const start = editor.selectionStart
  const end = editor.selectionEnd
  replaceEditorRange(start, end, snippet)
}

function replaceEditorRange(start, end, text, selectionStart = start + text.length, selectionEnd = selectionStart) {
  const before = editor.value.slice(0, start)
  const after = editor.value.slice(end)
  editor.value = before + text + after
  editor.focus()
  editor.setSelectionRange(selectionStart, selectionEnd)
  updateLineNumbers()
  updateStats()
  renderPlanMap()
  updatePreview()
  markUnsaved()
}

function slashTriggerAtCaret() {
  const caret = editor.selectionStart
  const text = editor.value.slice(0, caret)
  const match = text.match(/(^|[\s>])\/([a-z0-9-]*)$/i)
  if (!match) return null
  return { start: caret - match[2].length - 1, query: match[2].toLowerCase() }
}

function commandMatches(command, query) {
  if (!query) return true
  return [command.key, command.label, ...(command.aliases || [])]
    .some(value => value.toLowerCase().includes(query))
}

function updateSlashMenu() {
  const trigger = slashTriggerAtCaret()
  if (!trigger) {
    closeSlashMenu()
    return
  }
  slashOpen = true
  slashStart = trigger.start
  slashQuery = trigger.query
  slashIndex = 0
  slashItems = SLASH_COMMANDS.filter(command => commandMatches(command, slashQuery))
  renderSlashMenu()
}

function renderSlashMenu() {
  if (!slashOpen || !slashItems.length) {
    slashMenu.classList.add('hidden')
    if (!slashItems.length) slashOpen = false
    return
  }
  slashMenu.classList.remove('hidden')
  slashList.innerHTML = slashItems.map((item, i) => `
    <li class="slash-item ${i === slashIndex ? 'active' : ''}" data-index="${i}" role="option" aria-selected="${i === slashIndex ? 'true' : 'false'}">
      <strong>/${esc(item.key)}</strong>
      <span>${esc(item.label)}</span>
    </li>`).join('')
  positionSlashMenu()
}

function positionSlashMenu() {
  if (slashStart < 0) return

  const before = editor.value.slice(0, slashStart)
  const line = before.split('\n').length - 1
  const column = before.length - before.lastIndexOf('\n') - 1
  const editorStyle = getComputedStyle(editor)
  const editorPaneRect = document.getElementById('editor-pane').getBoundingClientRect()
  const editorRect = editor.getBoundingClientRect()
  const paddingLeft = parseFloat(editorStyle.paddingLeft) || 0
  const paddingTop = parseFloat(editorStyle.paddingTop) || 0
  const lineHeight = parseFloat(editorStyle.lineHeight) || 21
  const canvas = positionSlashMenu._canvas || (positionSlashMenu._canvas = document.createElement('canvas'))
  const ctx = canvas.getContext('2d')
  ctx.font = editorStyle.font
  const charWidth = ctx.measureText('m').width || 8
  const menuWidth = Math.min(360, Math.max(260, editorRect.width - 28))
  const lineX = editorRect.left - editorPaneRect.left + paddingLeft + (column * charWidth) - editor.scrollLeft
  const lineY = editorRect.top - editorPaneRect.top + paddingTop + (line * lineHeight) - editor.scrollTop
  const top = Math.max(8, Math.min(lineY + lineHeight + 4, editorPaneRect.height - 240))
  const left = Math.max(8, Math.min(lineX, editorPaneRect.width - menuWidth - 12))

  slashMenu.style.width = `${menuWidth}px`
  slashMenu.style.left = `${left}px`
  slashMenu.style.top = `${top}px`
}

function closeSlashMenu() {
  slashOpen = false
  slashIndex = 0
  slashQuery = ''
  slashStart = -1
  slashItems = []
  slashMenu.classList.add('hidden')
  slashMenu.removeAttribute('style')
}

function applySlashCommand(index = slashIndex) {
  const command = slashItems[index]
  if (!command || slashStart < 0) return false
  const end = editor.selectionStart
  replaceEditorRange(slashStart, end, command.snippet)
  closeSlashMenu()
  return true
}

function completePartialTag() {
  const caret = editor.selectionStart
  if (caret !== editor.selectionEnd) return false
  const before = editor.value.slice(0, caret)
  const match = before.match(/<([a-z0-9-]*)$/i)
  if (!match) return false
  const partial = match[1].toLowerCase()
  if (!partial) return false
  const tag = HTML_TAGS.find(item => item.startsWith(partial))
  if (!tag) return false
  const start = caret - partial.length
  const completion = TAG_COMPLETIONS[tag]
  const replacement = completion?.text.slice(1) || (VOID_TAGS.has(tag) ? `${tag} />` : `${tag}></${tag}>`)
  const selection = start + (completion ? completion.caretOffset - 1 : tag.length + 1)
  replaceEditorRange(start, caret, replacement, selection, selection)
  return true
}

function completeBareTag() {
  const caret = editor.selectionStart
  if (caret !== editor.selectionEnd) return false
  const before = editor.value.slice(0, caret)
  const match = before.match(/(^|[\s>])([a-z][a-z0-9-]*)$/i)
  if (!match) return false
  const token = match[2].toLowerCase()
  const tag = HTML_TAGS.find(item => item === token) || HTML_TAGS.find(item => item.startsWith(token))
  if (!tag) return false
  const start = caret - token.length
  const completion = TAG_COMPLETIONS[tag]
  const replacement = completion?.text || (VOID_TAGS.has(tag) ? `<${tag} />` : `<${tag}></${tag}>`)
  const selection = start + (completion?.caretOffset ?? (VOID_TAGS.has(tag) ? replacement.length : tag.length + 2))
  replaceEditorRange(start, caret, replacement, selection, selection)
  return true
}

function insertTabSpaces() {
  const start = editor.selectionStart
  const end = editor.selectionEnd
  replaceEditorRange(start, end, '  ')
}

function scheduleSave() {
  clearTimeout(saveTimer)
  if (autosaveEnabled) saveTimer = setTimeout(saveNow, autosaveDelayMs)
}

function markUnsaved() {
  dirty = true
  editVersion += 1
  setSaveState('Unsaved', 'dirty')
  scheduleSave()
}

async function saveNow() {
  return saveNowWithOptions({ allowCreate: true })
}

async function saveNowWithOptions(options = {}) {
  if (!activeFilePath) {
    if (options.allowCreate) return saveUntitledFile()
    setSaveState('Choose folder to save', 'dirty')
    return false
  }
  clearTimeout(saveTimer)
  const savingPath = activeFilePath
  const savingVersion = editVersion
  const savingContent = editor.value
  setSaveState('Saving…', 'saving')
  const ok = await window.htmlAPI.writeFile(savingPath, savingContent)
  if (savingPath !== activeFilePath) return false
  if (!ok) { setSaveState('Save failed', 'error'); return false }
  if (savingVersion === editVersion) {
    dirty = false
    await refreshFileList()
    setSaveState('Saved')
    return true
  } else {
    dirty = true
    setSaveState('Unsaved', 'dirty')
    scheduleSave()
    return true
  }
}

async function saveUntitledFile() {
  let dir = watchDir
  if (!dir) {
    dir = await window.htmlAPI.getWatchDir()
    if (!dir) {
      setSaveState('Unsaved', 'dirty')
      return false
    }
    watchDir = dir
    watchDirLabel.textContent = 'App Library'
  }

  clearTimeout(saveTimer)
  const savingVersion = editVersion
  const savingContent = editor.value
  const title = inferTitleFromContent(savingContent)
  setSaveState('Saving…', 'saving')

  const result = await window.htmlAPI.createHtmlFile(dir, title)
  if (!result) {
    setSaveState('Save failed', 'error')
    return false
  }

  const ok = await window.htmlAPI.writeFile(result.path, savingContent)
  if (!ok) {
    setSaveState('Save failed', 'error')
    return false
  }

  activeFilePath = result.path
  await refreshFileList()
  const file = files.find(f => f.path === activeFilePath)
  activeTitle.textContent = file?.title || title
  setPrefs({ lastFilePath: activeFilePath })
  renderDocList()

  if (savingVersion === editVersion) {
    dirty = false
    setSaveState('Saved')
  } else {
    dirty = true
    setSaveState('Unsaved', 'dirty')
    scheduleSave()
  }
  setToast(`Saved ${result.name}`)
  return true
}

// ── UI state ────────────────────────────────────────────────

function setTheme(next) {
  theme = next
  app.dataset.theme = theme
  themeBtn.textContent = theme === 'dark' ? 'Light' : 'Dark'
  setPrefs({ theme })
  updatePreview()
}

function setPaneMode(next) {
  paneMode = (paneMode === next) ? 'split' : next
  app.dataset.paneMode = paneMode
}

function setMoreMenuOpen(open) {
  moreActionsMenu.classList.toggle('hidden', !open)
  moreActionsBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
}

function closeMenus() {
  setMoreMenuOpen(false)
}

function bindPreviewMenuClose() {
  try {
    previewFrame.contentWindow?.addEventListener('pointerdown', closeMenus)
  } catch (_) {}
}

async function runMenuAction(fn) {
  setMoreMenuOpen(false)
  await fn()
}

// ── File operations ─────────────────────────────────────────

async function createFile() {
  await openBlankFile()
}

async function openBlankFile() {
  if (dirty) {
    const saved = await saveNow()
    if (!saved) return
  }
  activeFilePath = null
  dirty = false
  editVersion = 0
  clearTimeout(saveTimer)
  clearTimeout(previewTimer)
  editor.value = ''
  activeTitle.textContent = 'Untitled'
  setPrefs({ lastFilePath: null })
  renderDocList()
  updateLineNumbers()
  updateStats()
  renderPlanMap()
  updatePreview()
  setSaveState('Ready')
  editor.focus()
}

async function deleteFile() {
  if (!activeFilePath) return
  const file = files.find(f => f.path === activeFilePath)
  if (!confirm(`Delete ${file?.name}?`)) return
  const ok = await window.htmlAPI.deleteHtmlFile(activeFilePath)
  if (!ok) return setToast('Could not delete file')
  files = await window.htmlAPI.listHtmlFiles(watchDir)
  activeFilePath = null
  dirty = false
  editVersion = 0
  clearTimeout(saveTimer)
  editor.value = ''
  previewFrame.srcdoc = ''
  activeTitle.textContent = 'Untitled'
  setSaveState('Ready')
  updateLineNumbers()
  updateStats()
  renderPlanMap()
  renderDocList()
  if (files[0]) await openFile(files[0].path)
  setToast('File deleted')
}

async function renameFile(filePath = activeFilePath) {
  if (!filePath) return
  if (dirty && filePath === activeFilePath) {
    const saved = await saveNow()
    if (!saved) return
  }
  const file = files.find(f => f.path === filePath)
  const next = prompt('Rename file', file?.name || '')
  if (!next || next === file?.name) return
  const newPath = await window.htmlAPI.renameHtmlFile(filePath, next)
  if (!newPath) return setToast('Could not rename file')
  await refreshFileList()
  if (filePath === activeFilePath) {
    activeFilePath = newPath
    const renamed = files.find(f => f.path === newPath)
    activeTitle.textContent = renamed?.title || renamed?.name?.replace(/\.html$/, '') || 'Untitled'
    setPrefs({ lastFilePath: newPath })
    renderDocList()
  }
  setToast('File renamed')
}

async function openInBrowser() {
  const saved = await saveNow()
  if (!saved || !activeFilePath) return
  window.htmlAPI.openInBrowser(activeFilePath)
}

async function revealFile() {
  if (!activeFilePath) return
  window.htmlAPI.revealInFinder(activeFilePath)
}

async function copyFilePath() {
  if (!activeFilePath) return
  await navigator.clipboard.writeText(activeFilePath).catch(() => {})
  setToast('Path copied')
}

function parseCurrentDocument() {
  const source = editor.value
  const wrapped = /<html[\s>]/i.test(source) ? source : `<!DOCTYPE html><html><body>${source}</body></html>`
  return new DOMParser().parseFromString(wrapped, 'text/html')
}

function extractSectionText(heading) {
  const chunks = []
  let node = heading.nextElementSibling
  const level = Number(heading.tagName.slice(1))
  while (node) {
    if (/^H[1-6]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level) break
    if (!node.matches?.('[data-prototype], script, style')) {
      const text = plainText(node.textContent)
      if (text) chunks.push(text)
    }
    node = node.nextElementSibling
  }
  return chunks.join('\n')
}

function buildAgentBrief() {
  const doc = parseCurrentDocument()
  const title = plainText(doc.querySelector('title')?.textContent)
    || plainText(doc.querySelector('h1')?.textContent)
    || activeTitle.textContent
    || inferTitleFromContent(editor.value)
  const headings = [...doc.body.querySelectorAll('h1, h2, h3')]
  const prototypes = [...doc.body.querySelectorAll('[data-prototype]')]

  const lines = [`# ${title}`, '', '## Agent Handoff', 'Source of truth: the attached/saved HTML document. Preserve the document as plain HTML unless the task says otherwise.']

  if (headings.length) {
    lines.push('', '## Plan Sections')
    headings.forEach(heading => {
      const label = plainText(heading.textContent)
      const text = extractSectionText(heading)
      lines.push('', `${'#'.repeat(Math.min(Number(heading.tagName.slice(1)) + 1, 4))} ${label}`)
      if (text) lines.push(text)
    })
  }

  if (prototypes.length) {
    lines.push('', '## Prototype HTML')
    prototypes.forEach((prototype, index) => {
      const label = plainText(prototype.querySelector('h1, h2, h3')?.textContent) || `Prototype ${index + 1}`
      lines.push('', `### ${label}`, '```html', prototype.outerHTML.trim(), '```')
    })
  }

  lines.push('', '## Full HTML Source', '```html', editor.value.trim(), '```')
  return lines.join('\n')
}

async function copyAgentBrief() {
  if (!editor.value.trim()) return setToast('Nothing to copy')
  const brief = buildAgentBrief()
  await navigator.clipboard.writeText(brief).catch(() => {})
  setToast('Agent brief copied')
}

async function refreshLibrary() {
  if (!watchDir) watchDir = await window.htmlAPI.getWatchDir()
  if (!watchDir) return setToast('Could not open app library')
  files = await window.htmlAPI.listHtmlFiles(watchDir)
  renderDocList()
  setToast('Library refreshed')
}

// ── Palette ─────────────────────────────────────────────────

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
    ...files.map(f => ({
      type: 'doc',
      label: f.title || f.name.replace(/\.html$/, ''),
      detail: f.name,
      run: () => openFile(f.path),
    })),
    { type: 'action', label: 'New HTML file',        detail: 'Open a blank draft',                run: openBlankFile },
    { type: 'action', label: 'Insert plan',          detail: 'Insert agent handoff scaffold',      run: () => insertSnippet(PLAN_SNIPPET) },
    { type: 'action', label: 'Insert prototype',     detail: 'Insert inline prototype block',      run: () => insertSnippet(PROTOTYPE_SNIPPET) },
    { type: 'action', label: 'Copy agent brief',     detail: 'Copy clean handoff packet',          run: copyAgentBrief },
    { type: 'action', label: 'Open in browser',      detail: 'Open file in system browser',        run: openInBrowser },
    { type: 'action', label: 'Copy file path',       detail: 'Copy absolute path to clipboard',    run: copyFilePath },
    { type: 'action', label: 'Reveal in Finder',     detail: 'Show file in Finder',                run: revealFile },
    { type: 'action', label: 'Rename file',          detail: 'Rename the active file',             run: renameFile },
    { type: 'action', label: 'Delete file',          detail: 'Delete the active file',             run: deleteFile },
    { type: 'action', label: 'Refresh library',      detail: 'Reload saved HTML files',            run: refreshLibrary },
    { type: 'action', label: 'Toggle theme',         detail: theme === 'dark' ? 'Switch to light' : 'Switch to dark', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { type: 'action', label: 'Toggle autosave',      detail: autosaveEnabled ? 'Turn autosave off' : 'Turn autosave on', run: () => setAutosaveEnabled(!autosaveEnabled) },
    { type: 'action', label: 'Autosave delay',       detail: `Currently ${formatDelay(autosaveDelayMs)}`, run: cycleAutosaveDelay },
    { type: 'action', label: 'Editor full width',    detail: 'Expand editor pane',                 run: () => setPaneMode('editor') },
    { type: 'action', label: 'Preview full width',   detail: 'Expand preview pane',                run: () => setPaneMode('preview') },
  ]
}

function renderPalette() {
  const q = paletteInput.value.trim().toLowerCase()
  paletteItems = commandItems().filter(item => !q || `${item.label} ${item.detail}`.toLowerCase().includes(q))
  if (paletteIndex >= paletteItems.length) paletteIndex = Math.max(0, paletteItems.length - 1)
  paletteList.innerHTML = paletteItems.map((item, i) => `
    <li class="palette-item ${i === paletteIndex ? 'active' : ''}" data-index="${i}">
      <span>${item.type === 'doc' ? 'H' : '⌘'}</span>
      <strong>${esc(item.label)}</strong>
      <em>${esc(item.detail)}</em>
    </li>`).join('') || '<li class="palette-empty">No results.</li>'
}

function setPaletteActive(index) {
  paletteIndex = index
  paletteList.querySelectorAll('.palette-item').forEach((el, i) => el.classList.toggle('active', i === paletteIndex))
}

function runPaletteItem(index = paletteIndex) {
  const item = paletteItems[index]
  if (!item) return
  item.run()
  closePalette()
}

// ── Modal ────────────────────────────────────────────────────

function openNewDocModal() {
  newDocTitleInput.value = ''
  newDocModal.classList.remove('hidden')
  requestAnimationFrame(() => newDocTitleInput.focus())
}

function closeNewDocModal() {
  newDocModal.classList.add('hidden')
}

// ── Event wiring ─────────────────────────────────────────────

editor.addEventListener('input', () => {
  updateLineNumbers()
  updateStats()
  renderPlanMap()
  schedulePreview()
  markUnsaved()
  updateSlashMenu()
})

editor.addEventListener('scroll', () => {
  lineNumbers.scrollTop = editor.scrollTop
})

editor.addEventListener('keydown', e => {
  if (slashOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
    e.preventDefault()
    if (e.key === 'ArrowDown') {
      slashIndex = Math.min(slashIndex + 1, slashItems.length - 1)
      renderSlashMenu()
    } else if (e.key === 'ArrowUp') {
      slashIndex = Math.max(slashIndex - 1, 0)
      renderSlashMenu()
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      applySlashCommand()
    } else if (e.key === 'Escape') {
      closeSlashMenu()
    }
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    if (!completePartialTag() && !completeBareTag()) insertTabSpaces()
  } else if (e.key === 'Escape') {
    closeSlashMenu()
  }
})

editor.addEventListener('click', updateSlashMenu)

previewFrame.addEventListener('load', bindPreviewMenuClose)

docList.addEventListener('click', e => {
  const rename = e.target.closest('.doc-rename-btn')
  if (rename) {
    e.stopPropagation()
    renameFile(rename.dataset.path)
    return
  }
  const open = e.target.closest('.doc-open-btn')
  if (open) openFile(open.dataset.path)
})

planMap.addEventListener('click', e => {
  const item = e.target.closest('.plan-map-item')
  if (!item) return
  const index = Number(item.dataset.index)
  editor.focus()
  editor.setSelectionRange(index, index)
  const line = lineForIndex(editor.value, index)
  editor.scrollTop = Math.max(0, (line - 4) * 21)
  lineNumbers.scrollTop = editor.scrollTop
})

newDocBtn.addEventListener('click', openBlankFile)
newDocForm.addEventListener('submit', e => { e.preventDefault(); createFile() })
newDocCancel.addEventListener('click', closeNewDocModal)
newDocModal.addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeNewDocModal() })

activeRenameBtn.addEventListener('click', () => renameFile())
renameDocBtn.addEventListener('click', () => runMenuAction(renameFile))
deleteDocBtn.addEventListener('click', () => runMenuAction(deleteFile))
saveBtn.addEventListener('click', () => saveNow().then(ok => { if (ok) setToast('Saved') }))
openBrowserBtn.addEventListener('click', openInBrowser)
copyBriefBtn.addEventListener('click', copyAgentBrief)
copyPathBtn.addEventListener('click', () => runMenuAction(copyFilePath))
copyBriefMenuBtn.addEventListener('click', () => runMenuAction(copyAgentBrief))
revealDocBtn.addEventListener('click', () => runMenuAction(revealFile))
autosaveCheckbox.addEventListener('change', () => setAutosaveEnabled(autosaveCheckbox.checked))
autosaveDelayBtn.addEventListener('click', cycleAutosaveDelay)
themeBtn.addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark'))
commandBtn.addEventListener('click', openPalette)
editorFullBtn.addEventListener('click', () => setPaneMode('editor'))
previewFullBtn.addEventListener('click', () => setPaneMode('preview'))
sidebarToggle.addEventListener('click', () => app.classList.toggle('rail-hidden'))

moreActionsBtn.addEventListener('click', e => {
  e.stopPropagation()
  setMoreMenuOpen(moreActionsMenu.classList.contains('hidden'))
})

document.addEventListener('pointerdown', e => {
  if (!e.target.closest('.more-menu')) setMoreMenuOpen(false)
}, true)

paletteInput.addEventListener('input', () => { paletteIndex = 0; renderPalette() })
paletteInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); paletteIndex = Math.min(paletteIndex + 1, paletteItems.length - 1); renderPalette() }
  else if (e.key === 'ArrowUp') { e.preventDefault(); paletteIndex = Math.max(paletteIndex - 1, 0); renderPalette() }
  else if (e.key === 'Enter') { e.preventDefault(); runPaletteItem() }
  else if (e.key === 'Escape') { closePalette() }
})
paletteList.addEventListener('pointermove', e => {
  const item = e.target.closest('.palette-item')
  if (item) setPaletteActive(Number(item.dataset.index))
})
paletteList.addEventListener('click', e => {
  const item = e.target.closest('.palette-item')
  if (item) runPaletteItem(Number(item.dataset.index))
})
paletteBackdrop.addEventListener('click', closePalette)

slashList.addEventListener('pointermove', e => {
  const item = e.target.closest('.slash-item')
  if (item) {
    slashIndex = Number(item.dataset.index)
    renderSlashMenu()
  }
})

slashList.addEventListener('click', e => {
  const item = e.target.closest('.slash-item')
  if (item) applySlashCommand(Number(item.dataset.index))
})

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette() }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow().then(ok => { if (ok) setToast('Saved') }) }
  if (e.key === 'Escape' && !palette.classList.contains('hidden')) closePalette()
})

// ── Init ─────────────────────────────────────────────────────

async function init() {
  const prefs = getPrefs()
  setTheme(prefs.theme || 'dark')
  autosaveEnabled = prefs.autosaveEnabled !== false
  autosaveDelayMs = normalizeDelay(prefs.autosaveDelayMs)
  previewFont = normalizePreviewFont(prefs.previewFont)
  syncAutosaveControls()

  watchDir = await window.htmlAPI.getWatchDir()

  if (!watchDir) {
    watchDirLabel.textContent = 'App Library unavailable'
    renderDocList()
    renderPlanMap()
    return
  }

  watchDirLabel.textContent = 'App Library'
  await loadFiles()
  renderPlanMap()
}

init().catch(err => {
  console.error(err)
  setToast('Could not initialize')
})
