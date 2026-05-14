const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')

let mainWindow

function extractHtmlTitle(content) {
  const match = String(content || '').match(/<title[^>]*>([^<]+)<\/title>/i)
  return match ? match[1].trim() : null
}

function getLibraryDir() {
  const dir = path.join(__dirname, 'html-files')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function migrateLegacyLibrary() {
  try {
    const legacyDir = path.join(app.getPath('userData'), 'html-files')
    const libraryDir = getLibraryDir()
    if (!fs.existsSync(legacyDir) || legacyDir === libraryDir) return

    for (const name of fs.readdirSync(legacyDir)) {
      if (!name.endsWith('.html') || name.startsWith('.')) continue
      const source = path.join(legacyDir, name)
      const target = path.join(libraryDir, name)
      if (!fs.existsSync(target)) fs.copyFileSync(source, target)
    }
  } catch (_) {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#151515',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  })
  mainWindow.loadFile(path.join(__dirname, 'dist', 'renderer', 'index.html'))
}

app.whenReady().then(() => {
  migrateLegacyLibrary()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('get-watch-dir', () => {
  try { return getLibraryDir() } catch (_) { return null }
})

ipcMain.handle('set-watch-dir', () => {
  return true
})

ipcMain.handle('choose-directory', async () => {
  try { return getLibraryDir() } catch (_) { return null }
})

ipcMain.handle('list-html-files', () => {
  try {
    const dirPath = getLibraryDir()
    if (!dirPath || !fs.existsSync(dirPath)) return []
    return fs.readdirSync(dirPath)
      .filter(name => name.endsWith('.html') && !name.startsWith('.'))
      .map(name => {
        const filePath = path.join(dirPath, name)
        const stat = fs.statSync(filePath)
        let title = null
        try { title = extractHtmlTitle(fs.readFileSync(filePath, 'utf8')) } catch (_) {}
        return { name, path: filePath, mtime: stat.mtimeMs, size: stat.size, title }
      })
      .sort((a, b) => b.mtime - a.mtime)
  } catch (_) {
    return []
  }
})

ipcMain.handle('read-file', (_, filePath) => {
  try { return fs.readFileSync(filePath, 'utf8') } catch (_) { return null }
})

ipcMain.handle('write-file', (_, filePath, content) => {
  try { fs.writeFileSync(filePath, content, 'utf8'); return true } catch (_) { return false }
})

ipcMain.handle('open-in-browser', (_, filePath) => {
  return shell.openPath(filePath)
})

ipcMain.handle('reveal-in-finder', (_, filePath) => {
  shell.showItemInFolder(filePath)
  return true
})

ipcMain.handle('create-html-file', (_, _dirPath, title) => {
  try {
    const dirPath = getLibraryDir()
    const slug = String(title || 'untitled')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'untitled'
    let filename = `${slug}.html`
    let filePath = path.join(dirPath, filename)
    let counter = 1
    while (fs.existsSync(filePath)) {
      filename = `${slug}-${counter++}.html`
      filePath = path.join(dirPath, filename)
    }
    const safe = String(title || 'Untitled').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const template = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safe}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 40px;
      font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1a1a1a;
      background: #ffffff;
      max-width: 760px;
    }
    h1 { font-size: 28px; margin: 0 0 16px; letter-spacing: -0.03em; }
  </style>
</head>
<body>
  <h1>${safe}</h1>
  <p>Start writing here.</p>
</body>
</html>`
    fs.writeFileSync(filePath, template, 'utf8')
    return { name: filename, path: filePath }
  } catch (_) {
    return null
  }
})

ipcMain.handle('delete-html-file', (_, filePath) => {
  try { fs.unlinkSync(filePath); return true } catch (_) { return false }
})

ipcMain.handle('rename-html-file', (_, oldPath, newName) => {
  try {
    const dir = path.dirname(oldPath)
    const base = newName.endsWith('.html') ? newName : `${newName}.html`
    const newPath = path.join(dir, base)
    fs.renameSync(oldPath, newPath)
    return newPath
  } catch (_) {
    return null
  }
})
