const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('planAPI', {
  getPlans:       ()                      => ipcRenderer.invoke('get-plans'),
  getDesignDocs:  ()                      => ipcRenderer.invoke('get-design-docs'),
  getDesignDocContent: (filename)         => ipcRenderer.invoke('get-design-doc-content', filename),
  saveDesignDoc:  (filename, content)     => ipcRenderer.invoke('save-design-doc', filename, content),
  createDesignDoc:(project, title)         => ipcRenderer.invoke('create-design-doc', project, title),
  renameDesignDoc:(filename, nextFilename) => ipcRenderer.invoke('rename-design-doc', filename, nextFilename),
  deleteDesignDoc:(filename)               => ipcRenderer.invoke('delete-design-doc', filename),
  getDesignDocPath:(filename)              => ipcRenderer.invoke('get-design-doc-path', filename),
  revealDesignDoc:(filename)               => ipcRenderer.invoke('reveal-design-doc', filename),
  linkDesignFolder:()                       => ipcRenderer.invoke('link-design-folder'),
  getDesignSources:()                       => ipcRenderer.invoke('get-design-sources'),
  unlinkDesignFolder:(sourceId)             => ipcRenderer.invoke('unlink-design-folder', sourceId),
  refreshDesignFolders:()                   => ipcRenderer.invoke('refresh-design-folders'),
  lintDesignDoc:  (content)                => ipcRenderer.invoke('lint-design-doc', content),
  exportDesignDoc:(content, format)         => ipcRenderer.invoke('export-design-doc', content, format),
  getPlanContent: (filename)              => ipcRenderer.invoke('get-plan-content', filename),
  savePlan:       (filename, content)     => ipcRenderer.invoke('save-plan', filename, content),
  dismissLive:    (filename)              => ipcRenderer.invoke('dismiss-live', filename),
  loadComments:   (filename)              => ipcRenderer.invoke('load-comments', filename),
  saveComments:   (filename, comments)    => ipcRenderer.invoke('save-comments', filename, comments),
  loadReview:     (filename)              => ipcRenderer.invoke('load-review', filename),
  saveReview:     (filename, review)      => ipcRenderer.invoke('save-review', filename, review),
  loadTimeline:   (filename)              => ipcRenderer.invoke('load-timeline', filename),
  getLastPlan:         ()                => ipcRenderer.invoke('get-last-plan'),
  setLastPlan:         (filename)        => ipcRenderer.invoke('set-last-plan', filename),
  getSnapshots:        (filename)        => ipcRenderer.invoke('get-snapshots', filename),
  getSnapshotContent:  (filename, ts)    => ipcRenderer.invoke('get-snapshot-content', filename, ts),
  getPlanReferences:   (filename)        => ipcRenderer.invoke('get-plan-references', filename),
  getReferencedFile:   (filename, path)  => ipcRenderer.invoke('get-referenced-file', filename, path),
  getPrefs:            ()                => ipcRenderer.invoke('get-prefs'),
  setPrefs:            (prefs)           => ipcRenderer.invoke('set-prefs', prefs),
  onPlanUpdated:       (cb)              => ipcRenderer.on('plan:updated', (_, data) => cb(data)),
  onDesignDocsUpdated: (cb)              => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('design-docs:updated', handler)
    return () => ipcRenderer.removeListener('design-docs:updated', handler)
  },
  getSharingInfo:      ()                => ipcRenderer.invoke('get-sharing-info'),
})
