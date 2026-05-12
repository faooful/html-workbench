const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('htmlAPI', {
  listHtmlFiles:  (dirPath)             => ipcRenderer.invoke('list-html-files', dirPath),
  readFile:       (filePath)            => ipcRenderer.invoke('read-file', filePath),
  writeFile:      (filePath, content)   => ipcRenderer.invoke('write-file', filePath, content),
  openInBrowser:  (filePath)            => ipcRenderer.invoke('open-in-browser', filePath),
  revealInFinder: (filePath)            => ipcRenderer.invoke('reveal-in-finder', filePath),
  getWatchDir:    ()                    => ipcRenderer.invoke('get-watch-dir'),
  setWatchDir:    (dirPath)             => ipcRenderer.invoke('set-watch-dir', dirPath),
  chooseDirectory:()                    => ipcRenderer.invoke('choose-directory'),
  createHtmlFile: (dirPath, title)      => ipcRenderer.invoke('create-html-file', dirPath, title),
  deleteHtmlFile: (filePath)            => ipcRenderer.invoke('delete-html-file', filePath),
  renameHtmlFile: (oldPath, newName)    => ipcRenderer.invoke('rename-html-file', oldPath, newName),
})
