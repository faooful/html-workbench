const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('planAPI', {
  getPlans:       ()                      => ipcRenderer.invoke('get-plans'),
  getPlanContent: (filename)              => ipcRenderer.invoke('get-plan-content', filename),
  savePlan:       (filename, content)     => ipcRenderer.invoke('save-plan', filename, content),
  dismissLive:    (filename)              => ipcRenderer.invoke('dismiss-live', filename),
  loadComments:   (filename)              => ipcRenderer.invoke('load-comments', filename),
  saveComments:   (filename, comments)    => ipcRenderer.invoke('save-comments', filename, comments),
  getLastPlan:         ()                => ipcRenderer.invoke('get-last-plan'),
  setLastPlan:         (filename)        => ipcRenderer.invoke('set-last-plan', filename),
  getSnapshots:        (filename)        => ipcRenderer.invoke('get-snapshots', filename),
  getSnapshotContent:  (filename, ts)    => ipcRenderer.invoke('get-snapshot-content', filename, ts),
  onPlanUpdated:       (cb)              => ipcRenderer.on('plan:updated', (_, data) => cb(data)),
  getSharingInfo:      ()                => ipcRenderer.invoke('get-sharing-info'),
})
