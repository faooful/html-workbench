// Browser-mode API shim — replaces Electron's contextBridge/IPC with fetch + SSE.
// Loaded before renderer.js in web.html; sets window.WEB_MODE = true.

window.WEB_MODE = true

// Author name persisted in localStorage so comments carry attribution
const getAuthor = () => localStorage.getItem('pv_author') || ''
const setAuthor = n  => localStorage.setItem('pv_author', n.trim())

window.planAPI = {
  getPlans: () =>
    fetch('/api/plans').then(r => r.json()),

  getPlanContent: f =>
    fetch(`/api/plans/${encodeURIComponent(f)}`).then(r => r.ok ? r.text() : null),

  savePlan:    () => Promise.resolve(false),  // read-only in browser
  dismissLive: () => Promise.resolve(false),  // host-only action

  loadComments: f =>
    fetch(`/api/plans/${encodeURIComponent(f)}/comments`).then(r => r.json()).catch(() => []),

  saveComments: (f, comments) =>
    fetch(`/api/plans/${encodeURIComponent(f)}/comments`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(comments),
    }).then(r => r.json()),

  getLastPlan:  ()  => Promise.resolve(localStorage.getItem('pv_last') || null),
  setLastPlan:  f   => { localStorage.setItem('pv_last', f); return Promise.resolve(true) },

  getSnapshots: f =>
    fetch(`/api/snapshots/${encodeURIComponent(f)}`).then(r => r.json()).catch(() => []),

  getSnapshotContent: (f, ts) =>
    fetch(`/api/snapshots/${encodeURIComponent(f)}/${ts}`).then(r => r.ok ? r.text() : null),

  getPlanReferences: f =>
    fetch(`/api/plans/${encodeURIComponent(f)}/references`).then(r => r.json()).catch(() => []),

  getReferencedFile: (f, path) =>
    fetch(`/api/plans/${encodeURIComponent(f)}/references?path=${encodeURIComponent(path)}`)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null),

  getPrefs: () => Promise.resolve({
    lastPlan: localStorage.getItem('pv_last') || null,
    openTabs: JSON.parse(localStorage.getItem('pv_open_tabs') || '[]'),
  }),

  setPrefs: prefs => {
    if (prefs.lastPlan) localStorage.setItem('pv_last', prefs.lastPlan)
    if (Array.isArray(prefs.openTabs)) localStorage.setItem('pv_open_tabs', JSON.stringify(prefs.openTabs))
    return Promise.resolve(true)
  },

  onPlanUpdated: cb => {
    const connect = () => {
      const es = new EventSource('/api/events')
      es.onmessage = e => { try { cb(JSON.parse(e.data)) } catch (_) {} }
      es.onerror   = () => { es.close(); setTimeout(connect, 3000) }
    }
    connect()
  },

  // Extra web-only helpers for author attribution
  getAuthorName: getAuthor,
  setAuthorName: setAuthor,
}
