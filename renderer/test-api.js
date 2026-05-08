(function () {
  if (window.designAPI) return
  if (!location.pathname.includes('__desktop-test') && !location.search.includes('testApi=1')) return

  const now = new Date().toISOString()
  const repoSourceMap = {
    anchors: [
      { path: 'tokens.md', type: 'design-doc', reason: 'Agent/design guidance markdown', selected: true },
      { path: 'components.md', type: 'design-doc', reason: 'Agent/design guidance markdown', selected: true },
      { path: 'src/gui/studio/UserInsights.tsx', type: 'ui-source', reason: 'Likely rendered UI surface', selected: true },
      { path: 'src/core/components/ui/badge.tsx', type: 'component', reason: 'Reusable UI component source', selected: true },
      { path: 'tailwind.css', type: 'theme', reason: 'Theme or token source', selected: true },
    ],
  }
  const linkedRepos = [{ id: 'mock-repo', name: 'accidental-design-system', path: '/mock/accidental-design-system', builtIn: true, createdAt: now }]

  function repoFor(repoId) {
    return linkedRepos.find(repo => repo.id === repoId) || linkedRepos[0]
  }

  function row(type, name, value, count, files, category, extra = {}) {
    return {
      id: `${type}-${name}-${value}`.replace(/\W+/g, '-'),
      type,
      name,
      value,
      count,
      files,
      occurrences: extra.occurrences || [],
      category,
      metadata: extra.metadata || {},
    }
  }

  function rowsForDefaultRepo() {
    return [
      row('Component', 'Badge', 'Badge from @/src/core/components/ui/badge', 4, ['src/gui/studio/UserInsights.tsx'], 'Used component', { metadata: { importPath: '@/src/core/components/ui/badge', sourceFile: 'src/core/components/ui/badge.tsx', definitionFiles: ['src/core/components/ui/badge.tsx'], previewable: true } }),
      row('Component', 'UserAvatar', 'UserAvatar from @/src/gui/studio/components/UserAvatar', 2, ['src/gui/studio/UserInsights.tsx'], 'Used component', { metadata: { importPath: '@/src/gui/studio/components/UserAvatar', sourceFile: 'src/gui/studio/components/UserAvatar.tsx', definitionFiles: ['src/gui/studio/components/UserAvatar.tsx'], previewable: true } }),
      row('Component', 'DropdownMenu', 'DropdownMenu from src/core/components/ui/dropdown-menu.tsx', 1, ['src/gui/studio/UserInsights.tsx'], 'Used component', { metadata: { importPath: '@/src/core/components/ui/dropdown-menu', sourceFile: 'src/core/components/ui/dropdown-menu.tsx', definitionFiles: ['src/core/components/ui/dropdown-menu.tsx'], previewable: true } }),
      row('Component', 'DefinedOnlyCard', 'DefinedOnlyCard from src/core/components/DefinedOnlyCard.tsx', 0, [], 'Defined component', { metadata: { sourceFile: 'src/core/components/DefinedOnlyCard.tsx', definitionFiles: ['src/core/components/DefinedOnlyCard.tsx'], previewable: true, status: 'defined-unreferenced' } }),
      row('Icon', 'CheckIcon', 'lucide-react', 6, ['src/gui/studio/UserInsights.tsx'], 'Icon', { metadata: { importPath: 'lucide-react', kind: 'icon-import' } }),
      row('Icon', 'DatadogLogo', 'src/assets/icons/datadog-logo.svg', 0, [], 'SVG asset', { metadata: { sourceFiles: ['src/assets/icons/datadog-logo.svg'], kind: 'svg-asset', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l8 5v10l-8 5-8-5V7z"/></svg>' } }),
      row('Token', '--gui-card-bg', '--gui-card-bg', 3, ['components.md', 'tailwind.css'], 'CSS variable'),
      row('Token', '--background', '--background', 2, ['tokens.md', 'tailwind.css'], 'CSS variable'),
      row('Color', '#5E6DD6', '#5E6DD6', 4, ['tailwind.css', 'src/gui/studio/UserInsights.tsx'], 'Color', {
        metadata: { breakdown: { 'token-declaration': 2, 'direct-usage': 1, documentation: 1 }, tokenNames: ['--brand-primary'] },
        occurrences: [
          { file: 'tailwind.css', line: 12, kind: 'token-declaration', text: '--brand-primary: #5E6DD6;' },
          { file: 'src/gui/studio/UserInsights.tsx', line: 88, kind: 'direct-usage', text: 'style={{ color: "#5E6DD6" }}' },
        ],
      }),
      row('Color', '#ffffff', '#ffffff', 3, ['src/gui/studio/UserInsights.tsx'], 'Color', {
        metadata: { breakdown: { 'direct-usage': 3 } },
        occurrences: [{ file: 'src/gui/studio/UserInsights.tsx', line: 91, kind: 'direct-usage', text: '<Badge className="bg-green-600 text-white" />' }],
      }),
      row('Class', 'bg-card', 'bg-card', 7, ['src/gui/studio/UserInsights.tsx'], 'Visual'),
      row('Class', 'rounded-lg border border-transparent bg-card p-4 shadow-card', 'rounded-lg border border-transparent bg-card p-4 shadow-card', 5, ['src/gui/studio/UserInsights.tsx'], 'Repeated recipe'),
      row('File', 'tokens.md', 'The dark theme base is chromatic (purple-tinted), NOT neutral black.', 1, ['tokens.md'], 'Guidance', { metadata: { section: 'Gotchas' } }),
      row('File', '<Badge className="bg-green-600 text-white">', '<Badge className="bg-green-600 text-white">', 1, ['components.md'], 'Anti-pattern', { metadata: { instead: '<Badge variant="success">' } }),
    ]
  }

  function resultFor(repo, sourceMap, overrides = {}) {
    const inventoryRows = overrides.inventoryRows || rowsForDefaultRepo()
    return {
      repo,
      sourceMap,
      inventoryRows,
      summary: {
        scannedFiles: sourceMap.anchors.filter(anchor => anchor.selected !== false).length,
        colors: inventoryRows.filter(item => item.type === 'Color').length,
        cssVariables: inventoryRows.filter(item => item.type === 'Token').length,
        tailwindClasses: inventoryRows.filter(item => item.type === 'Class').length,
        componentImports: inventoryRows.filter(item => item.type === 'Component').length,
        icons: inventoryRows.filter(item => item.type === 'Icon').length,
        componentDefinitions: inventoryRows.filter(item => item.type === 'Component' && item.metadata?.definitionFiles?.length).length,
        unreferencedComponents: inventoryRows.filter(item => item.type === 'Component' && item.count === 0).length,
        unresolvedComponents: inventoryRows.filter(item => item.type === 'Component' && item.metadata?.unresolved).length,
        guidanceRules: inventoryRows.filter(item => item.category === 'Guidance').length,
        antiPatterns: inventoryRows.filter(item => item.category === 'Anti-pattern').length,
        smells: inventoryRows.filter(item => item.category === 'Style smell').length,
      },
      colors: [],
      cssVariables: [],
      tailwindClasses: [],
      componentImports: [],
      repeatedPatterns: [],
      guidanceRules: [],
      antiPatterns: [],
      smells: [],
      missingContext: [],
    }
  }

  window.designAPI = {
    getLinkedRepos: async () => linkedRepos,
    linkRepo: async () => {
      const additions = [
        { id: 'bits-repo', name: 'bits', path: '/mock/bits', builtIn: false, createdAt: now },
        { id: 'web-repo', name: 'web-ui', path: '/mock/web-ui', builtIn: false, createdAt: now },
      ]
      for (const item of additions) {
        if (!linkedRepos.find(repo => repo.id === item.id)) linkedRepos.push(item)
      }
      return additions[0]
    },
    unlinkRepo: async repoId => {
      const index = linkedRepos.findIndex(item => item.id === repoId && !item.builtIn)
      if (index >= 0) linkedRepos.splice(index, 1)
      return true
    },
    suggestRepoSources: async repoId => {
      const repo = repoFor(repoId)
      if (repo.id === 'web-repo') {
        return {
          repo,
          anchors: [
            { path: 'src/components/Button.tsx', type: 'component', reason: 'Reusable UI component source', selected: true },
            { path: 'src/app/dashboard/page.tsx', type: 'ui-source', reason: 'Likely rendered UI surface', selected: true },
            { path: 'src/styles/theme.css', type: 'theme', reason: 'Theme or token source', selected: true },
          ],
          generatedAt: now,
        }
      }
      return { repo, ...repoSourceMap, generatedAt: now }
    },
    scanRepoDesignInventory: async (repoId, sourceMap = repoSourceMap) => {
      const repo = repoFor(repoId)
      const map = sourceMap?.anchors ? sourceMap : await window.designAPI.suggestRepoSources(repoId)
      if (repo.id === 'web-repo') {
        return resultFor(repo, map, {
          inventoryRows: [
            row('Component', 'Button', 'Button from @/components/Button', 12, ['src/app/dashboard/page.tsx'], 'Used component', { metadata: { importPath: '@/components/Button', sourceFile: 'src/components/Button.tsx', definitionFiles: ['src/components/Button.tsx'], previewable: true } }),
            row('Icon', 'SettingsIcon', 'src/icons/settings.svg', 3, ['src/app/dashboard/page.tsx'], 'SVG asset', { metadata: { sourceFiles: ['src/icons/settings.svg'], kind: 'svg-asset', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>' } }),
            row('Token', '--brand-primary', '--brand-primary', 4, ['src/styles/theme.css'], 'CSS variable'),
            row('Color', '--surface-900', '#101010', 2, ['src/styles/theme.css'], 'Color', { metadata: { tokenNames: ['--surface-900'] } }),
            row('Class', 'flex items-center gap-2', 'flex items-center gap-2', 9, ['src/app/dashboard/page.tsx'], 'Repeated recipe'),
            row('File', 'src/styles/theme.css', 'src/styles/theme.css', 1, ['src/styles/theme.css'], 'Theme source'),
          ],
        })
      }
      return resultFor(repo, map)
    },
    getComponentPreviewCandidates: async (_repoId, scanResult) => {
      return (scanResult?.inventoryRows || []).filter(row => row.type === 'Component').map(row => ({
        id: row.id,
        name: row.name,
        importPath: row.metadata?.importPath || '',
        count: row.count,
        files: row.files || [],
        status: 'pending',
      }))
    },
    renderComponentPreview: async (_repoId, row) => {
      if (row.name === 'UserAvatar') {
        return { status: 'Needs example', error: 'Preview needs user data props.', files: row.files || [] }
      }
      if (row.name === 'DropdownMenu') {
        return { status: 'Needs interaction', error: 'This primitive needs an open-state example.', files: row.files || [] }
      }
      return {
        status: 'Preview loading',
        html: `<html><body style="margin:0;display:grid;place-items:center;height:100%;background:transparent;color:#ededed;font:13px system-ui"><button style="border:1px solid #454545;border-radius:6px;background:#202020;color:#ededed;padding:8px 12px">${row.name}</button><script>requestAnimationFrame(() => parent.postMessage({ type: 'component-preview-status', componentId: ${JSON.stringify(row.id)}, status: 'Preview' }, '*'))</script></body></html>`,
        files: row.files || [],
      }
    },
  }
})()
