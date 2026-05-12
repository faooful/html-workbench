// HTML Workbench

let files = []
let activeFilePath = null
let dirty = false
let saveTimer = null
let previewTimer = null
let paletteIndex = 0
let paletteItems = []
let paneMode = 'split'
let theme = 'dark'
let watchDir = null

const app        = document.getElementById('app')
const docList    = document.getElementById('doc-list')
const newDocBtn  = document.getElementById('new-doc-btn')
const sidebarToggle   = document.getElementById('sidebar-toggle')
const activeTitle     = document.getElementById('active-title')
const commandBtn      = document.getElementById('command-btn')
const themeBtn        = document.getElementById('theme-btn')
const saveBtn         = document.getElementById('save-btn')
const openBrowserBtn  = document.getElementById('open-browser-btn')
const copyPathBtn     = document.getElementById('copy-path-btn')
const revealDocBtn    = document.getElementById('reveal-doc-btn')
const renameDocBtn    = document.getElementById('rename-doc-btn')
const deleteDocBtn    = document.getElementById('delete-doc-btn')
const chooseDirBtn    = document.getElementById('choose-dir-btn')
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
  return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function relativeTime(ms) {
  const d = Date.now() - ms
  if (d < 60000) return 'just now'
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return `${Math.floor(d / 86400000)}d ago`
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

// ── File list ──────────────────────────────────────────────

async function loadFiles() {
  if (!watchDir) return
  files = await window.htmlAPI.listHtmlFiles(watchDir)
  renderDocList()
  const prefs = getPrefs()
  const target = files.find(f => f.path === prefs.lastFilePath) || files[0]
  if (target) await openFile(target.path)
}

async function openFile(filePath) {
  if (dirty) await saveNow()
  const content = await window.htmlAPI.readFile(filePath)
  if (content == null) return
  activeFilePath = filePath
  dirty = false
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
    docList.innerHTML = '<div class="empty-list">Choose a folder first.</div>'
    return
  }
  if (!files.length) {
    docList.innerHTML = '<div class="empty-list">No HTML files here yet.</div>'
    return
  }
  docList.innerHTML = files.map(file => {
    const active = file.path === activeFilePath ? ' active' : ''
    const name = file.name.replace(/\.html$/, '')
    const sub = (file.title && file.title !== name) ? file.title : relativeTime(file.mtime)
    return `<button class="doc-row${active}" data-path="${esc(file.path)}">
      <span class="doc-icon">H</span>
      <span>
        <strong>${esc(name)}</strong>
        <em>${esc(sub)}</em>
      </span>
    </button>`
  }).join('')
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
}

function scheduleSave() {
  dirty = true
  setSaveState('Unsaved', 'dirty')
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 700)
}

async function saveNow() {
  if (!activeFilePath) return
  clearTimeout(saveTimer)
  setSaveState('Saving…', 'saving')
  const ok = await window.htmlAPI.writeFile(activeFilePath, editor.value)
  if (!ok) { setSaveState('Save failed', 'error'); return }
  dirty = false
  setSaveState('Saved')
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

async function runMenuAction(fn) {
  setMoreMenuOpen(false)
  await fn()
}

// ── File operations ─────────────────────────────────────────

async function createFile() {
  const title = newDocTitleInput.value.trim()
  if (!title || !watchDir) return
  const result = await window.htmlAPI.createHtmlFile(watchDir, title)
  if (!result) return setToast('Could not create file')
  closeNewDocModal()
  files = await window.htmlAPI.listHtmlFiles(watchDir)
  await openFile(result.path)
  setToast('File created')
}

async function deleteFile() {
  if (!activeFilePath) return
  const file = files.find(f => f.path === activeFilePath)
  if (!confirm(`Delete ${file?.name}?`)) return
  const ok = await window.htmlAPI.deleteHtmlFile(activeFilePath)
  if (!ok) return setToast('Could not delete file')
  files = await window.htmlAPI.listHtmlFiles(watchDir)
  activeFilePath = null
  editor.value = ''
  previewFrame.srcdoc = ''
  activeTitle.textContent = 'Untitled'
  setSaveState('Ready')
  renderDocList()
  if (files[0]) await openFile(files[0].path)
  setToast('File deleted')
}

async function renameFile() {
  if (!activeFilePath) return
  const file = files.find(f => f.path === activeFilePath)
  const next = prompt('Rename file', file?.name || '')
  if (!next || next === file?.name) return
  const newPath = await window.htmlAPI.renameHtmlFile(activeFilePath, next)
  if (!newPath) return setToast('Could not rename file')
  files = await window.htmlAPI.listHtmlFiles(watchDir)
  await openFile(newPath)
  setToast('File renamed')
}

async function openInBrowser() {
  if (!activeFilePath) return
  await saveNow()
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

async function chooseDir() {
  const dir = await window.htmlAPI.chooseDirectory()
  if (!dir) return
  watchDir = dir
  await window.htmlAPI.setWatchDir(dir)
  watchDirLabel.textContent = dir.split('/').pop()
  setPrefs({ lastWatchDir: dir })
  files = []
  activeFilePath = null
  editor.value = ''
  previewFrame.srcdoc = ''
  activeTitle.textContent = 'Untitled'
  setSaveState('Ready')
  renderDocList()
  await loadFiles()
  setToast(`Watching ${dir.split('/').pop()}`)
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
    { type: 'action', label: 'New HTML file',        detail: 'Create a new .html file',           run: openNewDocModal },
    { type: 'action', label: 'Open in browser',      detail: 'Open file in system browser',        run: openInBrowser },
    { type: 'action', label: 'Copy file path',       detail: 'Copy absolute path to clipboard',    run: copyFilePath },
    { type: 'action', label: 'Reveal in Finder',     detail: 'Show file in Finder',                run: revealFile },
    { type: 'action', label: 'Rename file',          detail: 'Rename the active file',             run: renameFile },
    { type: 'action', label: 'Delete file',          detail: 'Delete the active file',             run: deleteFile },
    { type: 'action', label: 'Change watch folder',  detail: 'Choose a different folder to watch', run: chooseDir },
    { type: 'action', label: 'Toggle theme',         detail: theme === 'dark' ? 'Switch to light' : 'Switch to dark', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
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
  scheduleSave()
})

editor.addEventListener('scroll', () => {
  lineNumbers.scrollTop = editor.scrollTop
})

docList.addEventListener('click', e => {
  const row = e.target.closest('.doc-row')
  if (row) openFile(row.dataset.path)
})

newDocBtn.addEventListener('click', openNewDocModal)
newDocForm.addEventListener('submit', e => { e.preventDefault(); createFile() })
newDocCancel.addEventListener('click', closeNewDocModal)
newDocModal.addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeNewDocModal() })

renameDocBtn.addEventListener('click', () => runMenuAction(renameFile))
deleteDocBtn.addEventListener('click', () => runMenuAction(deleteFile))
chooseDirBtn.addEventListener('click', () => runMenuAction(chooseDir))
saveBtn.addEventListener('click', () => saveNow().then(() => setToast('Saved')))
openBrowserBtn.addEventListener('click', openInBrowser)
copyPathBtn.addEventListener('click', () => runMenuAction(copyFilePath))
revealDocBtn.addEventListener('click', () => runMenuAction(revealFile))
themeBtn.addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark'))
commandBtn.addEventListener('click', openPalette)
editorFullBtn.addEventListener('click', () => setPaneMode('editor'))
previewFullBtn.addEventListener('click', () => setPaneMode('preview'))
sidebarToggle.addEventListener('click', () => app.classList.toggle('rail-hidden'))

moreActionsBtn.addEventListener('click', e => {
  e.stopPropagation()
  setMoreMenuOpen(moreActionsMenu.classList.contains('hidden'))
})

document.addEventListener('click', e => {
  if (!e.target.closest('.more-menu')) setMoreMenuOpen(false)
})

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
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow().then(() => setToast('Saved')) }
  if (e.key === 'Escape' && !palette.classList.contains('hidden')) closePalette()
})

// ── Init ─────────────────────────────────────────────────────

async function init() {
  const prefs = getPrefs()
  setTheme(prefs.theme || 'dark')

  watchDir = prefs.lastWatchDir || await window.htmlAPI.getWatchDir()

  if (!watchDir) {
    watchDirLabel.textContent = 'No folder chosen'
    renderDocList()
    return
  }

  watchDirLabel.textContent = watchDir.split('/').pop()
  await loadFiles()
}

init().catch(err => {
  console.error(err)
  setToast('Could not initialize')
})
