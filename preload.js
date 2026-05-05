const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('designAPI', {
  getDesignDocs: () => ipcRenderer.invoke('get-design-docs'),
  getDesignDocContent: filename => ipcRenderer.invoke('get-design-doc-content', filename),
  saveDesignDoc: (filename, content) => ipcRenderer.invoke('save-design-doc', filename, content),
  createDesignDoc: (project, title) => ipcRenderer.invoke('create-design-doc', project, title),
  renameDesignDoc: (filename, nextFilename) => ipcRenderer.invoke('rename-design-doc', filename, nextFilename),
  deleteDesignDoc: filename => ipcRenderer.invoke('delete-design-doc', filename),
  getDesignDocPath: filename => ipcRenderer.invoke('get-design-doc-path', filename),
  revealDesignDoc: filename => ipcRenderer.invoke('reveal-design-doc', filename),
  linkDesignFolder: () => ipcRenderer.invoke('link-design-folder'),
  getDesignSources: () => ipcRenderer.invoke('get-design-sources'),
  unlinkDesignFolder: sourceId => ipcRenderer.invoke('unlink-design-folder', sourceId),
  refreshDesignFolders: () => ipcRenderer.invoke('refresh-design-folders'),
  lintDesignDoc: content => ipcRenderer.invoke('lint-design-doc', content),
  exportDesignDoc: (content, format) => ipcRenderer.invoke('export-design-doc', content, format),
  onDesignDocsUpdated: cb => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('design-docs:updated', handler)
    return () => ipcRenderer.removeListener('design-docs:updated', handler)
  },
})
