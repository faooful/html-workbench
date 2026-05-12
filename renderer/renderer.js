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
let autosaveDelayMs = 3000

const AUTOSAVE_DELAYS = [1000, 3000, 5000, 10000]

const app        = document.getElementById('app')
const docList    = document.getElementById('doc-list')
const newDocBtn  = document.getElementById('new-doc-btn')
const sidebarToggle   = document.getElementById('sidebar-toggle')
const activeTitle     = document.getElementById('active-title')
const activeRenameBtn = document.getElementById('active-rename-btn')
const commandBtn      = document.getElementById('command-btn')
const themeBtn        = document.getElementById('theme-btn')
const saveBtn         = document.getElementById('save-btn')
const openBrowserBtn  = document.getElementById('open-browser-btn')
const copyPathBtn     = document.getElementById('copy-path-btn')
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
  return AUTOSAVE_DELAYS.includes(ms) ? ms : 3000
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
  previewFrame.srcdoc = editor.value
  requestAnimationFrame(bindPreviewMenuClose)
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
  previewFrame.srcdoc = ''
  activeTitle.textContent = 'Untitled'
  setPrefs({ lastFilePath: null })
  renderDocList()
  updateLineNumbers()
  updateStats()
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
  schedulePreview()
  markUnsaved()
})

editor.addEventListener('scroll', () => {
  lineNumbers.scrollTop = editor.scrollTop
})

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

newDocBtn.addEventListener('click', openBlankFile)
newDocForm.addEventListener('submit', e => { e.preventDefault(); createFile() })
newDocCancel.addEventListener('click', closeNewDocModal)
newDocModal.addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeNewDocModal() })

activeRenameBtn.addEventListener('click', () => renameFile())
renameDocBtn.addEventListener('click', () => runMenuAction(renameFile))
deleteDocBtn.addEventListener('click', () => runMenuAction(deleteFile))
saveBtn.addEventListener('click', () => saveNow().then(ok => { if (ok) setToast('Saved') }))
openBrowserBtn.addEventListener('click', openInBrowser)
copyPathBtn.addEventListener('click', () => runMenuAction(copyFilePath))
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
  syncAutosaveControls()

  watchDir = await window.htmlAPI.getWatchDir()

  if (!watchDir) {
    watchDirLabel.textContent = 'App Library unavailable'
    renderDocList()
    return
  }

  watchDirLabel.textContent = 'App Library'
  await loadFiles()
}

init().catch(err => {
  console.error(err)
  setToast('Could not initialize')
})
