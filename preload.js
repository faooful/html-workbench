const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('designAPI', {
  getLinkedRepos: () => ipcRenderer.invoke('get-linked-repos'),
  linkRepo: () => ipcRenderer.invoke('link-repo'),
  unlinkRepo: repoId => ipcRenderer.invoke('unlink-repo', repoId),
  suggestRepoSources: repoId => ipcRenderer.invoke('suggest-repo-sources', repoId),
  scanRepoDesignInventory: (repoId, sourceMap) => ipcRenderer.invoke('scan-repo-design-inventory', repoId, sourceMap),
  getComponentSource: (repoId, componentRow) => ipcRenderer.invoke('get-component-source', repoId, componentRow),
  getDevServerInfo: repoId => ipcRenderer.invoke('get-dev-server-info', repoId),
})
