(function () {
  if (window.htmlAPI) return
  if (!location.pathname.includes('__desktop-test') && !location.search.includes('testApi=1')) return

  const mockDir = '/mock/html-artifacts'
  const now = Date.now()

  let mockFiles = [
    {
      name: 'checkout-spec.html',
      path: `${mockDir}/checkout-spec.html`,
      mtime: now - 1000 * 60 * 5,
      size: 4200,
      title: 'Checkout Flow Spec',
    },
    {
      name: 'api-latency-report.html',
      path: `${mockDir}/api-latency-report.html`,
      mtime: now - 1000 * 60 * 60 * 2,
      size: 8100,
      title: 'API Latency Report',
    },
    {
      name: 'onboarding-design.html',
      path: `${mockDir}/onboarding-design.html`,
      mtime: now - 1000 * 60 * 60 * 24,
      size: 3500,
      title: null,
    },
  ]

  if (new URLSearchParams(location.search).has('emptyLibrary')) {
    mockFiles = []
  }

  const mockContent = {
    [`${mockDir}/checkout-spec.html`]: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Checkout Flow Spec</title>
  <style>
    body { font: 15px/1.6 system-ui; margin: 0; padding: 40px; max-width: 720px; color: #1a1a1a; }
    h1 { font-size: 26px; margin: 0 0 24px; }
    h2 { font-size: 18px; margin: 28px 0 12px; }
    p { margin: 10px 0; color: #444; }
  </style>
</head>
<body>
  <h1>Checkout Flow Spec</h1>
  <h2>Overview</h2>
  <p>This document describes the checkout flow for the v2 redesign.</p>
  <h2>States</h2>
  <p>Cart → Address → Payment → Confirmation</p>
</body>
</html>`,
    [`${mockDir}/api-latency-report.html`]: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>API Latency Report</title>
  <style>
    body { font: 14px/1.5 system-ui; margin: 0; padding: 32px; color: #111; }
    h1 { font-size: 22px; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
  </style>
</head>
<body>
  <h1>API Latency Report</h1>
  <table>
    <tr><th>Endpoint</th><th>p50</th><th>p95</th><th>p99</th></tr>
    <tr><td>/api/checkout</td><td>42ms</td><td>180ms</td><td>842ms</td></tr>
    <tr><td>/api/products</td><td>18ms</td><td>72ms</td><td>210ms</td></tr>
  </table>
</body>
</html>`,
    [`${mockDir}/onboarding-design.html`]: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Onboarding Design</title>
  <style>
    body { font: 15px/1.6 system-ui; margin: 0; padding: 40px; background: #fafafa; }
    .card { background: white; border-radius: 12px; padding: 32px; max-width: 480px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
    h2 { margin: 0 0 12px; font-size: 22px; }
    button { margin-top: 20px; padding: 10px 20px; background: #5E6DD6; color: white; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Welcome to Bits</h2>
    <p>Get started by connecting your first repository.</p>
    <button>Connect repository</button>
  </div>
</body>
</html>`,
  }

  const saved = {}

  window.htmlAPI = {
    listHtmlFiles:   async () => mockFiles,
    readFile:        async (path) => saved[path] || mockContent[path] || null,
    writeFile:       async (path, content) => {
      saved[path] = content
      const file = mockFiles.find(f => f.path === path)
      if (file) {
        file.mtime = Date.now()
        file.size = content.length
      }
      return true
    },
    openInBrowser:   async () => true,
    revealInFinder:  async () => true,
    getWatchDir:     async () => mockDir,
    setWatchDir:     async () => true,
    chooseDirectory: async () => mockDir,
    createHtmlFile:  async (dir, title) => {
      const name = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '.html'
      const path = `${dir}/${name}`
      const file = { name, path, mtime: Date.now(), size: 300, title }
      mockFiles.unshift(file)
      return { name, path }
    },
    deleteHtmlFile:  async (path) => {
      const i = mockFiles.findIndex(f => f.path === path)
      if (i >= 0) mockFiles.splice(i, 1)
      return true
    },
    renameHtmlFile:  async (oldPath, newName) => {
      const f = mockFiles.find(f => f.path === oldPath)
      if (!f) return null
      const dir = oldPath.split('/').slice(0, -1).join('/')
      const base = newName.endsWith('.html') ? newName : `${newName}.html`
      const newPath = `${dir}/${base}`
      f.name = base
      f.path = newPath
      return newPath
    },
  }
})()
