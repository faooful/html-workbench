import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Button,
  TooltipProvider,
} from './components/ui'
import { cn } from './lib/utils'
import {
  Check,
  ChevronRight,
  FolderOpen,
  Menu,
  Moon,
  Palette,
  RefreshCw,
  Search,
  Sun,
} from 'lucide-react'

const APP_THEME_KEY = 'local-library-app-theme'
const ICON_PREVIEW_THEME_KEY = 'local-library-icon-preview-theme'
const APP_THEMES = new Set(['dark', 'light'])
const ICON_PREVIEW_THEMES = new Set(['auto', 'light', 'dark', 'checker'])

function storedChoice(key, allowed, fallback) {
  try {
    const value = window.localStorage.getItem(key)
    return allowed.has(value) ? value : fallback
  } catch (_) {
    return fallback
  }
}

function rowsOf(rows, type) {
  return rows.filter(row => row.type === type)
}

function rowsWhere(rows, predicate) {
  return rows.filter(predicate)
}

function topRows(rows, limit = 12) {
  return [...rows].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit)
}

function compactFiles(row) {
  const files = row.files || []
  if (!files.length) return 'No files'
  if (files.length === 1) return files[0]
  return `${files[0]} +${files.length - 1}`
}

function isRenderableColor(value) {
  return /^#[0-9a-fA-F]{3,8}$|^rgba?\([^)]+\)$|^hsla?\([^)]+\)$/.test(String(value || ''))
}

function domId(prefix, value) {
  return `${prefix}-${String(value || '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)}`
}

function searchText(row) {
  return [
    row.type,
    row.name,
    row.value,
    row.category,
    row.metadata?.importPath,
    row.metadata?.sourceFile,
    row.metadata?.displayPath,
    ...(row.metadata?.definitionFiles || []),
    ...(row.metadata?.sourceFiles || []),
    ...(row.files || []),
    ...(row.metadata?.tokenNames || []),
  ].filter(Boolean).join(' ').toLowerCase()
}

function normalizeSearchValue(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function references(row) {
  return (row.files || []).slice(0, 5)
}

function definitionFiles(row) {
  return (row.metadata?.definitionFiles || (row.metadata?.sourceFile ? [row.metadata.sourceFile] : [])).slice(0, 3)
}

function colorLabel(row) {
  return row.metadata?.tokenNames?.[0] || row.name
}

function SourcePane({ source }) {
  if (!source) return <div className="component-source-empty muted">No source</div>
  return (
    <div className="component-source-wrap">
      {source.kind === 'usage' && <span className="component-source-label">Usage in repo</span>}
      <pre className="component-source"><code>{source.snippet}</code></pre>
    </div>
  )
}

function ComponentCard({ row, source }) {
  const defs = definitionFiles(row)
  return (
    <article id={domId('row', row.id)} className="component-card scroll-target">
      <SourcePane source={source} />
      <div className="component-card-body">
        <div className="component-title-row">
          <h3>{row.name}</h3>
        </div>
        <p>{row.metadata?.importPath || row.metadata?.sourceFile || row.value}</p>
        <div className="reference-list">
          <strong>{row.count ? `${row.count} references` : 'Defined, no references found'}</strong>
          {references(row).map(file => <code key={file}>{file}</code>)}
          {!!defs.length && (
            <>
              <strong>Defined in</strong>
              {defs.map(file => <code key={`def-${file}`}>{file}</code>)}
            </>
          )}
        </div>
      </div>
    </article>
  )
}

function ColorCard({ row }) {
  const label = colorLabel(row)
  return (
    <article id={domId('row', row.id)} className="swatch-card scroll-target">
      <div className="swatch" style={{ background: isRenderableColor(row.value) ? row.value : 'var(--panel-strong)' }} />
      <div>
        <h3>{label}</h3>
        <code>{row.value}</code>
        <p>{compactFiles(row)}</p>
      </div>
    </article>
  )
}

function TokenCard({ row }) {
  return (
    <article id={domId('row', row.id)} className="token-card scroll-target">
      <code>{row.value}</code>
      <span>{row.count} references</span>
      <small>{compactFiles(row)}</small>
    </article>
  )
}

function ClassRecipeCard({ row }) {
  return (
    <article id={domId('row', row.id)} className="recipe-card scroll-target">
      <div className="recipe-preview" />
      <code>{row.value}</code>
      <span>{row.count} references · {compactFiles(row)}</span>
    </article>
  )
}

function iconSources(row) {
  return row.metadata?.sourceFiles?.length ? row.metadata.sourceFiles : row.files || []
}

function iconStatus(row) {
  return row.metadata?.renderStatus || (row.metadata?.svg ? 'Rendered' : 'No preview')
}

function iconPath(row) {
  return row.metadata?.displayPath || row.metadata?.importPath || row.value
}

function IconCard({ row, previewTheme }) {
  const status = iconStatus(row)
  return (
    <article id={domId('row', row.id)} className="icon-card scroll-target">
      <div className={cn('icon-preview', status !== 'Rendered' && 'icon-preview-empty')} data-preview-theme={previewTheme}>
        {row.metadata?.svg ? (
          <span dangerouslySetInnerHTML={{ __html: row.metadata.svg }} />
        ) : (
          <span className="icon-fallback">No preview</span>
        )}
      </div>
      <div className="icon-card-body">
        <div className="icon-title-row">
          <h3>{row.name}</h3>
          <span className={cn('icon-status', status === 'Rendered' ? 'icon-status-rendered' : 'icon-status-empty')}>{status}</span>
        </div>
        <code>{iconPath(row)}</code>
        <span>{row.metadata?.sourceKind || row.category || 'Icon'}</span>
        <span>{row.count ? `${row.count} references` : 'Asset or defined icon'}</span>
        {iconSources(row).slice(0, 3).map(file => <small key={file}>{file}</small>)}
      </div>
    </article>
  )
}

function EmptySection({ children }) {
  return <p className="catalog-empty">{children}</p>
}

const CATALOG_SECTIONS = [
  { id: 'icons', label: 'Icons' },
  { id: 'components', label: 'Components' },
  { id: 'colors', label: 'Colors' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'classes', label: 'Classes' },
]

function scrollToCatalogTarget(targetId) {
  const node = document.getElementById(targetId)
  if (!node) return false
  node.scrollIntoView({ block: 'start', behavior: 'smooth' })
  return true
}

function CommandPalette({ open, query, onQueryChange, items, onClose, onSelect }) {
  if (!open) return null
  return (
    <div className="command-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="command-panel" role="dialog" aria-modal="true" aria-label="Search catalogue">
        <div className="command-input-row">
          <Search className="h-4 w-4" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') onClose()
              if (event.key === 'Enter' && items[0]) onSelect(items[0])
            }}
            placeholder="Search components, icons, colors..."
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-list">
          {items.length ? items.map(item => (
            <button key={item.id} type="button" className="command-item" onClick={() => onSelect(item)}>
              <span className="command-kind">{item.kind}</span>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </button>
          )) : <p className="command-empty">No matches</p>}
        </div>
      </div>
    </div>
  )
}

function ComponentCatalogue({ scanResult, sources, scanning, iconPreviewTheme, onJumpToSection }) {
  const rows = scanResult?.inventoryRows || []
  const summary = scanResult?.summary || {}
  const iconRows = rowsOf(rows, 'Icon')
  const icons = topRows(iconRows, iconRows.length || 1)
  const components = topRows(rowsOf(rows, 'Component'), 200)
  const tokens = topRows(rowsOf(rows, 'Token'), 80)
  const colors = topRows(rowsOf(rows, 'Color'), 80)
  const classRecipes = topRows(rowsWhere(rows, row => row.type === 'Class' && /recipe|Visual|Layout|Spacing|Typography|Radius|Class/.test(row.category || '')), 18)

  if (scanning && !rows.length) {
    return (
      <div className="guide-loading">
        <RefreshCw className="h-5 w-5" />
        <span>Scanning design system…</span>
      </div>
    )
  }

  return (
    <article className="catalog-document">
      <section className="catalog-hero">
        <p className="section-label">Icon catalogue</p>
        <h1>Icons in this repo.</h1>
        <div className="guide-metrics">
          <span><strong>{summary.icons || iconRows.length}</strong> icons</span>
          <span><strong>{icons.filter(row => iconStatus(row) === 'Rendered').length}</strong> rendered</span>
          <span><strong>{summary.componentImports || components.length}</strong> components</span>
          <span><strong>{summary.cssVariables || tokens.length}</strong> tokens</span>
          <span><strong>{summary.colors || colors.length}</strong> colors</span>
          <span><strong>{summary.tailwindClasses || classRecipes.length}</strong> class patterns</span>
        </div>
        <nav className="section-jump-nav" aria-label="Catalogue sections">
          {CATALOG_SECTIONS.map(section => (
            <button key={section.id} type="button" onClick={() => onJumpToSection(section.id)}>
              {section.label}
            </button>
          ))}
        </nav>
      </section>

      <section id="section-icons" className="catalog-section scroll-target">
        <div className="catalog-heading">
          <p className="section-label">Icons</p>
          <h2>Icons in this repo</h2>
          {!!icons.length && <span className="section-count">Showing {icons.length} of {summary.icons || iconRows.length}</span>}
        </div>
        {icons.length ? (
          <div className="icon-grid">
            {icons.map(row => <IconCard key={row.id} row={row} previewTheme={iconPreviewTheme} />)}
          </div>
        ) : <EmptySection>No local icons detected.</EmptySection>}
      </section>

      <section id="section-components" className="catalog-section scroll-target">
        <div className="catalog-heading">
          <p className="section-label">Components</p>
          <h2>Used and defined components</h2>
        </div>
        {components.length ? (
          <div className="component-grid">
            {components.map(row => (
              <ComponentCard
                key={row.id}
                row={row}
                source={sources[row.id]}
              />
            ))}
          </div>
        ) : <EmptySection>No component imports detected.</EmptySection>}
      </section>

      <section id="section-colors" className="catalog-section scroll-target">
        <div className="catalog-heading">
          <p className="section-label">Colors</p>
          <h2>Rendered color values</h2>
        </div>
        {colors.length ? (
          <div className="swatch-grid">
            {colors.map(row => <ColorCard key={row.id} row={row} />)}
          </div>
        ) : <EmptySection>No color values detected.</EmptySection>}
      </section>

      <section id="section-tokens" className="catalog-section scroll-target">
        <div className="catalog-heading">
          <p className="section-label">Tokens</p>
          <h2>Token names</h2>
        </div>
        {tokens.length ? (
          <div className="token-grid">
            {tokens.map(row => <TokenCard key={row.id} row={row} />)}
          </div>
        ) : <EmptySection>No tokens detected.</EmptySection>}
      </section>

      <section id="section-classes" className="catalog-section scroll-target">
        <div className="catalog-heading">
          <p className="section-label">Classes</p>
          <h2>Repeated class recipes</h2>
        </div>
        {classRecipes.length ? (
          <div className="recipe-grid">
            {classRecipes.map(row => <ClassRecipeCard key={row.id} row={row} />)}
          </div>
        ) : <EmptySection>No repeated class recipes detected.</EmptySection>}
      </section>
    </article>
  )
}

function DevServerBanner({ devServer, previewOpen, onOpen, onClose }) {
  if (!devServer) return null
  return (
    <div className={cn('dev-server-banner', devServer.running && 'dev-server-running')}>
      {devServer.running ? (
        <>
          <span className="dev-server-dot" aria-hidden="true" />
          <span className="dev-server-url">{devServer.url}</span>
          {previewOpen
            ? <button className="dev-server-action" onClick={onClose}>Close preview</button>
            : <button className="dev-server-action" onClick={onOpen}>Open in preview</button>}
        </>
      ) : (
        <>
          <span className="dev-server-label">Not running</span>
          <code className="dev-server-cmd">{devServer.command}</code>
        </>
      )}
    </div>
  )
}

function App() {
  const [repos, setRepos] = useState([])
  const [activeRepoId, setActiveRepoId] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [sources, setSources] = useState({})
  const [devServer, setDevServer] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [railOpen, setRailOpen] = useState(true)
  const [toast, setToast] = useState('')
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [appTheme, setAppTheme] = useState(() => storedChoice(APP_THEME_KEY, APP_THEMES, 'dark'))
  const [iconPreviewTheme, setIconPreviewTheme] = useState(() => storedChoice(ICON_PREVIEW_THEME_KEY, ICON_PREVIEW_THEMES, 'auto'))

  const activeRepo = repos.find(repo => repo.id === activeRepoId) || repos[0]
  const canRefresh = Boolean(activeRepo)
  const commandItems = commandItemsForScan(scanResult, commandQuery)

  useEffect(() => {
    loadRepos()
  }, [])

  useEffect(() => {
    window.localStorage.setItem(APP_THEME_KEY, appTheme)
  }, [appTheme])

  useEffect(() => {
    window.localStorage.setItem(ICON_PREVIEW_THEME_KEY, iconPreviewTheme)
  }, [iconPreviewTheme])

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function loadRepos(nextActiveId = activeRepoId) {
    const list = await window.designAPI.getLinkedRepos()
    setRepos(list)
    const target = nextActiveId || list[0]?.id || ''
    setActiveRepoId(target)
    if (target) await generateGuide(target, false)
  }

  async function linkRepo() {
    const repo = await window.designAPI.linkRepo()
    if (!repo) return
    await loadRepos(repo.id)
    ping(`Linked ${repo.name}`)
  }

  async function detachRepo(repoId) {
    await closePreview()
    await window.designAPI.unlinkRepo(repoId)
    if (repoId === activeRepoId) {
      setScanResult(null)
      setDevServer(null)
      setSources({})
    }
    await loadRepos(repoId === activeRepoId ? '' : activeRepoId)
  }

  async function selectRepo(repoId) {
    setActiveRepoId(repoId)
    await generateGuide(repoId, false)
  }

  async function generateGuide(repoId = activeRepoId, notify = true) {
    if (!repoId) return
    await closePreview()
    setScanning(true)
    setScanResult(null)
    setSources({})
    setDevServer(null)
    try {
      const nextSourceMap = await window.designAPI.suggestRepoSources(repoId)
      if (!nextSourceMap) return
      const result = await window.designAPI.scanRepoDesignInventory(repoId, nextSourceMap)
      setScanResult(result)
      const [, devInfo] = await Promise.all([
        loadComponentSources(repoId, result),
        window.designAPI.getDevServerInfo(repoId).catch(() => null),
      ])
      setDevServer(devInfo || null)
      if (notify) ping('Guide refreshed')
    } finally {
      setScanning(false)
    }
  }

  function openPreview() {
    if (devServer?.url) setPreviewOpen(true)
  }

  function closePreview() {
    setPreviewOpen(false)
  }

  async function loadComponentSources(repoId, result) {
    const components = (result?.inventoryRows || []).filter(row => row.type === 'Component')
    const entries = await Promise.all(
      components.map(async row => {
        const source = await window.designAPI.getComponentSource(repoId, row).catch(() => null)
        return [row.id, source]
      })
    )
    setSources(Object.fromEntries(entries.filter(([, v]) => v)))
  }

  function ping(message) {
    setToast(message)
    window.setTimeout(() => setToast(''), 1500)
  }

  function toggleAppTheme() {
    setAppTheme(current => current === 'dark' ? 'light' : 'dark')
  }

  function jumpToSection(sectionId) {
    scrollToCatalogTarget(`section-${sectionId}`)
  }

  function selectCommandItem(item) {
    setCommandOpen(false)
    setCommandQuery('')
    if (item.kind === 'Section') {
      jumpToSection(item.target)
      return
    }
    scrollToCatalogTarget(domId('row', item.target))
  }

  return (
    <TooltipProvider>
      <div id="app" className={cn('app-shell', !railOpen && 'rail-hidden')} data-theme={appTheme}>
        <aside id="repo-rail" className="repo-rail">
          <div className="traffic-spacer" />
          <div className="rail-body">
            <div className="rail-heading">
              <span className="section-label">Repos</span>
              <Button size="icon" variant="ghost" aria-label="Link repo" onClick={linkRepo}><FolderOpen className="h-4 w-4" /></Button>
            </div>
            <div className="repo-list">
              {repos.map(repo => (
                <div key={repo.id} className={cn('repo-row-wrap', repo.id === activeRepo?.id && 'active')}>
                  <button className="repo-row" onClick={() => selectRepo(repo.id)}>
                    <span className="repo-mark">R</span>
                    <span className="min-w-0">
                      <strong>{repo.name}</strong>
                      <small>{repo.builtIn ? 'dogfood repo' : repo.path}</small>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {!repo.builtIn && (
                    <button className="repo-detach" aria-label={`Remove ${repo.name}`} onClick={() => detachRepo(repo.id)} title="Remove repo">×</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="inventory-workspace">
          <header className="topbar">
            <div className="title-block">
              <Button size="icon" variant="ghost" aria-label="Toggle repos" onClick={() => setRailOpen(!railOpen)}><Menu className="h-4 w-4" /></Button>
              <div className="min-w-0">
                <p className="section-label">Local Library</p>
                <h1>{activeRepo?.name || 'Link a repo'}</h1>
              </div>
            </div>
            <div className="topbar-actions">
              <Button variant="ghost" onClick={() => setCommandOpen(true)}><Search className="h-4 w-4" />Search <kbd className="button-kbd">⌘K</kbd></Button>
              <Button size="icon" variant="ghost" aria-label={`Switch to ${appTheme === 'dark' ? 'light' : 'dark'} mode`} onClick={toggleAppTheme}>
                {appTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <div className="preview-theme-control" aria-label="Icon preview background">
                <Palette className="h-4 w-4" aria-hidden="true" />
                {['auto', 'light', 'dark', 'checker'].map(theme => (
                  <button
                    key={theme}
                    type="button"
                    className={cn(iconPreviewTheme === theme && 'active')}
                    aria-pressed={iconPreviewTheme === theme}
                    onClick={() => setIconPreviewTheme(theme)}
                  >
                    {theme}
                  </button>
                ))}
              </div>
              <Button onClick={() => generateGuide()} disabled={!canRefresh || scanning}><RefreshCw className="h-4 w-4" />{scanning ? 'Generating' : 'Refresh'}</Button>
            </div>
          </header>

          <DevServerBanner
            devServer={devServer}
            previewOpen={previewOpen}
            onOpen={openPreview}
            onClose={closePreview}
          />

          <div className="inventory-layout">
            {previewOpen && devServer?.url ? (
              <webview src={devServer.url} className="dev-preview-webview" />
            ) : (
              <section className="main-panel">
                <ComponentCatalogue
                  scanResult={scanResult}
                  sources={sources}
                  scanning={scanning}
                  iconPreviewTheme={iconPreviewTheme}
                  onJumpToSection={jumpToSection}
                />
              </section>
            )}
          </div>
        </main>

        <CommandPalette
          open={commandOpen}
          query={commandQuery}
          onQueryChange={setCommandQuery}
          items={commandItems}
          onClose={() => setCommandOpen(false)}
          onSelect={selectCommandItem}
        />
        {!!toast && <div className="toast"><Check className="h-4 w-4" />{toast}</div>}
      </div>
    </TooltipProvider>
  )
}

function commandItemsForScan(scanResult, query) {
  const rows = scanResult?.inventoryRows || []
  const needle = String(query || '').trim().toLowerCase()
  const normalizedNeedle = normalizeSearchValue(query)
  const sections = CATALOG_SECTIONS.map(section => ({
    id: `section-${section.id}`,
    kind: 'Section',
    title: section.label,
    subtitle: `Jump to ${section.label.toLowerCase()}`,
    target: section.id,
  }))
  const rowItems = rows
    .filter(row => ['Component', 'Icon', 'Color', 'Token', 'Class'].includes(row.type))
    .map(row => ({
      id: row.id,
      kind: row.type,
      type: row.type,
      title: row.type === 'Color' ? colorLabel(row) : row.name,
      subtitle: row.type === 'Icon'
        ? iconPath(row)
        : row.type === 'Component'
          ? (row.metadata?.importPath || row.metadata?.sourceFile || compactFiles(row))
          : row.value,
      target: row.id,
      haystack: searchText(row),
      count: row.count || 0,
    }))
  const items = [...sections, ...rowItems]
  return (needle
    ? items.filter(item => {
      const raw = `${item.title} ${item.subtitle} ${item.kind} ${item.haystack || ''}`.toLowerCase()
      return raw.includes(needle) || normalizeSearchValue(raw).includes(normalizedNeedle)
    })
    : items
  )
    .sort((a, b) => Number(b.kind === 'Section') - Number(a.kind === 'Section') || (b.count || 0) - (a.count || 0) || a.title.localeCompare(b.title))
    .slice(0, 40)
}

createRoot(document.getElementById('root')).render(<App />)
