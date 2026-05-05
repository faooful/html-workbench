import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { marked } from 'marked'
import yaml from 'js-yaml'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Badge,
  Button,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  TooltipProvider,
} from './components/ui'
import { cn } from './lib/utils'
import {
  FilePlus2,
  FolderOpen,
  Maximize2,
  Menu,
  MoreHorizontal,
  PanelsLeftRight,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels'

marked.setOptions({ gfm: true, breaks: false })

const COMPONENT_TYPES = ['button', 'input', 'card', 'modal', 'toolbar', 'sidebar', 'table', 'toast']
const COMPONENT_ALIASES = {
  badge: 'badge',
  textarea: 'input',
  select: 'input',
  dialog: 'modal',
  popover: 'modal',
  empty: 'card',
  skeleton: 'generic',
  spinner: 'generic',
  tooltip: 'generic',
  tabs: 'generic',
  accordion: 'generic',
  command: 'generic',
  'dropdown-menu': 'generic',
  'contextual-menu': 'generic',
  'scroll-area': 'generic',
}
const COMPONENT_FAMILY_KEYS = [...COMPONENT_TYPES, ...Object.keys(COMPONENT_ALIASES)]

const STARTER_BLOCKS = [
  {
    id: 'frontmatter',
    label: 'Front matter shell',
    type: 'yaml',
    content: `---
version: alpha
name: Product Design Language
description: Design contract for agents implementing this product.
colors:
  primary: "#5E6DD6"
  on-primary: "#FFFFFF"
  surface: "#17191F"
  panel: "#20232B"
  text: "#F2F4F8"
typography:
  body-md:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: 6px
  md: 10px
spacing:
  sm: 8px
  md: 16px
components: {}
---`,
  },
  {
    id: 'tokens',
    label: 'Tokens',
    type: 'yaml',
    content: `colors:
  primary: "#5E6DD6"
  primary-hover: "#4654C9"
  danger: "#FF646D"
  surface: "#17191F"
  panel: "#20232B"
  text: "#F2F4F8"
typography:
  body-md:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
spacing:
  sm: 8px
  md: 16px
rounded:
  sm: 6px
  md: 10px`,
  },
  {
    id: 'typography',
    label: 'Typography',
    type: 'yaml',
    content: `typography:
  title-lg:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.12
  body-md:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
  mono-sm:
    fontFamily: Geist Mono
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.5`,
  },
  {
    id: 'button',
    label: 'Button component',
    type: 'yaml',
    content: `components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    height: 32px
    padding: "0 14px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    borderColor: "rgba(255, 255, 255, 0.14)"
    rounded: "{rounded.sm}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"`,
  },
  {
    id: 'input',
    label: 'Input component',
    type: 'yaml',
    content: `components:
  input-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    borderColor: "rgba(255, 255, 255, 0.16)"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: 34px
  input-error:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    borderColor: "{colors.danger}"`,
  },
  {
    id: 'card',
    label: 'Card component',
    type: 'yaml',
    content: `components:
  card-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    borderColor: "rgba(255, 255, 255, 0.10)"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"`,
  },
  {
    id: 'modal',
    label: 'Modal component',
    type: 'yaml',
    content: `components:
  modal-dialog:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    borderColor: "rgba(255, 255, 255, 0.12)"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"`,
  },
  {
    id: 'layout',
    label: 'Layout guidance',
    content: `## Layout Guidance

- Keep primary authoring content visible without modal-heavy flows.
- Use compact controls and predictable pane boundaries.
- Prefer local-first surfaces over cloud-dashboard patterns.
- Collapse secondary panels before the editor becomes cramped.`,
  },
  {
    id: 'agent-rules',
    label: 'Agent implementation rules',
    content: `## Agent Implementation Rules

- Read this DESIGN.md before implementing UI changes.
- Reuse the tokens and components defined in front matter.
- Do not introduce new colors, spacing, or component states unless this file is updated.
- If a token is missing, ask for clarification instead of guessing.`,
  },
]

const INITIAL_DOC = {
  filename: '',
  title: 'Untitled',
  project: 'local',
  readiness: { state: 'needs_structure', warnings: [] },
}

function titleCase(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function slugify(value) {
  return String(value || 'design')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'design'
}

function mergeDeep(base, incoming) {
  const output = { ...(base || {}) }
  Object.entries(incoming || {}).forEach(([key, value]) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      output[key] &&
      typeof output[key] === 'object' &&
      !Array.isArray(output[key])
    ) {
      output[key] = mergeDeep(output[key], value)
    } else {
      output[key] = value
    }
  })
  return output
}

function extractFrontMatter(text) {
  if (!text.startsWith('---\n')) return { hasFrontMatter: false, body: text, data: {}, frontMatter: '' }
  const end = text.indexOf('\n---', 4)
  if (end < 0) return { hasFrontMatter: true, body: '', data: {}, frontMatter: text.slice(4), error: 'Missing closing front matter fence.' }
  const frontMatter = text.slice(4, end)
  const body = text.slice(end + 4).replace(/^\n/, '')
  try {
    return { hasFrontMatter: true, frontMatter, body, data: yaml.load(frontMatter) || {} }
  } catch (err) {
    return { hasFrontMatter: true, frontMatter, body, data: {}, error: err.message || 'Could not parse YAML front matter.' }
  }
}

function getPath(obj, ref) {
  return String(ref || '').split('.').reduce((acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined), obj)
}

function resolveValue(value, root, warnings = [], path = '') {
  if (typeof value !== 'string') return value
  const match = value.match(/^\{([^}]+)\}$/)
  if (!match) return value
  const resolved = getPath(root, match[1])
  if (resolved === undefined) {
    warnings.push({ severity: 'warning', path, message: `Unresolved token reference {${match[1]}}.` })
    return value
  }
  return resolved
}

function resolveObject(obj, root, prefix = '') {
  const warnings = []
  const resolved = {}
  Object.entries(obj || {}).forEach(([key, value]) => {
    resolved[key] = resolveValue(value, root, warnings, prefix ? `${prefix}.${key}` : key)
  })
  return { resolved, warnings }
}

function parseProseTokens(content) {
  const tokens = {}
  const tokenSection = content.match(/##\s+Tokens([\s\S]*?)(?=\n##\s+|$)/i)?.[1] || ''
  for (const line of tokenSection.split('\n')) {
    const match = line.match(/[-*]\s*([^:]+):\s*(.+)$/)
    if (match) tokens[slugify(match[1])] = match[2].trim()
  }
  return tokens
}

function parseProseComponents(content) {
  const section = content.match(/##\s+.*Components.*\n[\s\S]*?(?=\n##\s+|$)/i)?.[0] || ''
  const headings = [...section.matchAll(/^###\s+(.+)$/gm)].map(match => match[1])
  const components = headings.map(name => ({ name: slugify(name), title: name, props: {}, source: 'prose' }))
  const seen = new Set(components.map(component => component.name))
  const addHint = (name, props = {}) => {
    const key = slugify(name)
    if (!key || seen.has(key)) return
    seen.add(key)
    components.push({ name: key, title: titleCase(key), props, source: 'prose' })
  }

  const sourcePathPattern = /["'`](?:[^"'`]*\/)?([a-z0-9-]+)\.(?:tsx|ts|css)["'`]/gi
  for (const match of content.matchAll(sourcePathPattern)) {
    const stem = match[1]
    const normalized = stem
      .replace(/chat-sidebar/i, 'sidebar')
      .replace(/app-sidebar/i, 'sidebar')
      .replace(/dropdown-menu/i, 'dropdown-menu')
      .replace(/contextual-menu/i, 'contextual-menu')
    addHint(normalized, { import: match[0].slice(1, -1) })
  }

  const componentNamePattern = /`(Empty(?:Title|Description)?|Skeleton|Spinner|Button|Input|Badge|Dialog|Modal|Toast|Table|Toolbar|Sidebar|DropdownMenu|ContextualMenu|Command)`/g
  for (const match of content.matchAll(componentNamePattern)) {
    const name = match[1]
      .replace(/Empty.*/, 'empty')
      .replace(/DropdownMenu/, 'dropdown-menu')
      .replace(/ContextualMenu/, 'contextual-menu')
    addHint(name, { note: 'Referenced in prose guidance.' })
  }

  const rawElementPattern = /`<\s*(button|input|select|textarea|label|table)\b/gi
  for (const match of content.matchAll(rawElementPattern)) {
    const name = ['select', 'textarea', 'label'].includes(match[1].toLowerCase()) ? 'input' : match[1]
    addHint(name, { note: 'Required wrapper component referenced in prose guidance.' })
  }

  return components
}

function analyzeDesignDoc(content, lintReport = null) {
  const extracted = extractFrontMatter(content || '')
  const data = extracted.data || {}
  const localIssues = []
  if (!extracted.hasFrontMatter) {
    localIssues.push({ severity: 'warning', path: 'frontmatter', message: 'Missing YAML front matter. This is a prose-only draft.' })
  }
  if (extracted.error) {
    localIssues.push({ severity: 'error', path: 'frontmatter', message: extracted.error })
  }
  if (extracted.hasFrontMatter && !data.colors?.primary) {
    localIssues.push({ severity: 'warning', path: 'colors.primary', message: 'Missing primary color token.' })
  }
  if (extracted.hasFrontMatter && !data.typography) {
    localIssues.push({ severity: 'warning', path: 'typography', message: 'Missing typography tokens.' })
  }

  const components = data.components
    ? Object.entries(data.components).map(([name, props]) => ({ name, title: titleCase(name), props: props || {}, source: 'frontmatter' }))
    : parseProseComponents(extracted.body || content)

  const resolvedComponents = components.map(component => {
    const result = resolveObject(component.props, data, `components.${component.name}`)
    localIssues.push(...result.warnings)
    return { ...component, resolvedProps: result.resolved, warnings: result.warnings }
  })

  const tokenCount = Object.values(data.colors || {}).length + Object.values(data.typography || {}).length + Object.values(data.spacing || {}).length + Object.values(data.rounded || {}).length
  const issueCount = localIssues.filter(issue => issue.severity !== 'info').length + (lintReport?.summary?.errors || 0) + (lintReport?.summary?.warnings || 0)

  return {
    raw: content || '',
    ...extracted,
    proseTokens: parseProseTokens(extracted.body || content),
    components: resolvedComponents,
    localIssues,
    lintReport,
    state: extracted.hasFrontMatter && !extracted.error && issueCount === 0 ? 'ready' : extracted.hasFrontMatter ? 'warnings' : 'needs_structure',
    tokenCount,
  }
}

function hasComponentContract(analysis) {
  return Boolean(analysis?.data?.components && Object.keys(analysis.data.components).length)
}

function hasRenderableComponents(analysis) {
  return Boolean(analysis?.components?.length)
}

function groupByProject(docs) {
  return docs.reduce((map, doc) => {
    const key = doc.project || doc.repo || doc.filename.split('/')[0] || 'local'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(doc)
    return map
  }, new Map())
}

function displayDocPath(doc) {
  return doc?.displayPath || doc?.filename || ''
}

function lineNumbers(content) {
  const count = Math.max(1, String(content || '').split('\n').length)
  return Array.from({ length: count }, (_, index) => String(index + 1)).join('\n')
}

function stats(content) {
  const text = String(content || '')
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  return `Characters: ${text.length.toLocaleString()} · Words: ${words.toLocaleString()} · Lines: ${Math.max(1, text.split('\n').length).toLocaleString()}`
}

function statusVariant(doc, analysis) {
  const state = analysis?.state || doc?.readiness?.state || doc?.status
  if (state === 'ready') return 'success'
  if (state === 'warnings') return 'warning'
  return 'muted'
}

function statusLabel(doc, analysis) {
  const state = analysis?.state || doc?.readiness?.state || doc?.status
  if (state === 'ready') return 'Ready'
  if (state === 'warnings') return 'Warnings'
  return 'Draft'
}

function paneToggleMeta(paneMode, target) {
  const isActive = paneMode === target
  if (isActive) {
    return {
      label: 'Return to split view',
      Icon: PanelsLeftRight,
      next: 'split',
    }
  }
  return {
    label: target === 'editor' ? 'Expand editor' : 'Expand preview',
    Icon: Maximize2,
    next: target,
  }
}

function DocumentPreview({ analysis }) {
  const summary = analysis.hasFrontMatter
    ? `<div class="summary-card mb-6"><div class="flex items-center justify-between gap-3"><strong>${escapeHtml(analysis.data.name || 'Design contract')}</strong><span class="rounded-full border border-emerald-500/35 px-2 py-0.5 text-xs text-emerald-300">${analysis.state === 'ready' ? 'Ready' : 'Draft'}</span></div><p class="mt-2 text-sm text-muted-foreground">${Object.keys(analysis.data.colors || {}).length} colors · ${Object.keys(analysis.data.typography || {}).length} type styles · ${Object.keys(analysis.data.spacing || {}).length} spacing · ${Object.keys(analysis.data.components || {}).length} components</p></div>`
    : '<div class="summary-card mb-6"><strong class="text-red-400">Prose-only draft</strong><p class="mt-2 text-sm text-muted-foreground">Add YAML front matter to turn this into a Stitch-style DESIGN.md contract.</p></div>'
  return <article id="document-preview" className="preview-view markdown-body" dangerouslySetInnerHTML={{ __html: summary + marked.parse(analysis.body || analysis.raw || '') }} />
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}

function TokensPreview({ analysis }) {
  const data = analysis.data || {}
  const groups = [
    ['Colors', data.colors],
    ['Typography', data.typography],
    ['Spacing', data.spacing],
    ['Radius', data.rounded],
  ].filter(([, group]) => group && Object.keys(group).length)
  if (!groups.length) return <div className="preview-view"><div className="summary-card text-muted-foreground">Add Stitch-style YAML front matter with colors, typography, spacing, and rounded tokens.</div></div>
  return (
    <div id="tokens-preview" className="preview-view space-y-5">
      {groups.map(([label, group]) => (
        <section key={label} className="space-y-3">
          <h2 className="preview-section-title section-label">{label}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(group).map(([key, value]) => (
              <div key={key} className="preview-card">
                <div className="flex items-center gap-3">
                  {label === 'Colors' && <span className="h-6 w-6 rounded border border-border" style={{ background: String(value) }} />}
                  <div className="min-w-0">
                    <strong className="block truncate text-sm">{key}</strong>
                    <code className="text-xs text-muted-foreground">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function componentFamilyKey(name) {
  const lower = name.toLowerCase()
  const known = COMPONENT_FAMILY_KEYS
    .sort((a, b) => b.length - a.length)
    .find(type => lower === type || lower.startsWith(`${type}-`) || lower.startsWith(`${type}_`))
  if (known) return known
  return lower.split(/[-_]/)[0] || lower
}

function componentTypeForKey(key) {
  if (COMPONENT_TYPES.includes(key)) return key
  return COMPONENT_ALIASES[key] || 'generic'
}

function groupComponents(components) {
  const map = new Map()
  components.forEach(component => {
    const key = componentFamilyKey(component.name)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(component)
  })
  return [...map.entries()].map(([key, definitions]) => ({ key, type: componentTypeForKey(key), title: titleCase(key), definitions }))
}

function componentSourceLabel(source) {
  return source?.displayPath || source?.filename || ''
}

function ComponentContractSet({ analysis, source, heading = true, onOpenSource }) {
  return (
    <div className="space-y-4">
      {heading && (
        <div className="summary-card">
          {source?.filename && onOpenSource ? (
            <Button variant="link" className="h-auto p-0 text-base font-bold text-foreground" onClick={() => onOpenSource(source.filename)}>
              {source?.title || 'Component contract'}
            </Button>
          ) : (
            <strong>{source?.title || 'Component contract'}</strong>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            From {componentSourceLabel(source)} · {analysis.components.length} definition{analysis.components.length === 1 ? '' : 's'}
          </p>
        </div>
      )}
      {groupComponents(analysis.components).map(family => <ComponentFamily key={`${source?.filename || 'active'}-${family.key}`} family={family} />)}
    </div>
  )
}

function ComponentsPreview({ analysis, relatedComponentSources = [], onOpenSource }) {
  if (!analysis.components.length) {
    return (
      <div id="components-preview" className="preview-view space-y-4">
        {!!relatedComponentSources.length ? (
          <>
            <div className="summary-card space-y-2">
              <h2 className="text-lg font-bold">Project component contract</h2>
              <p className="text-muted-foreground">
                This file has no local <code>components:</code> map, so the preview is using sibling component guidance from the same linked folder.
              </p>
            </div>
            {relatedComponentSources.map(source => (
              <ComponentContractSet key={source.filename} analysis={source.analysis} source={source} heading onOpenSource={onOpenSource} />
            ))}
          </>
        ) : (
          <div className="summary-card space-y-3">
            <h2 className="text-lg font-bold">No components in this file</h2>
            <p className="text-muted-foreground">
              Components render from this file's own top-level YAML <code>components:</code> map, prose component headings, source-file references, or sibling component docs.
            </p>
            <pre className="overflow-auto rounded-md border border-border bg-panel-subtle p-3 text-xs"><code>{STARTER_BLOCKS.find(block => block.id === 'button').content}</code></pre>
          </div>
        )}
      </div>
    )
  }
  return (
    <div id="components-preview" className="preview-view space-y-4">
      <div className="summary-card">
        <strong>From DESIGN.md contract</strong>
        <p className="mt-1 text-sm text-muted-foreground">Live playground generated from YAML component entries. Edit tokens or component props and the examples update here.</p>
      </div>
      <ComponentContractSet analysis={analysis} source={null} heading={false} />
    </div>
  )
}

function pickDefinition(definitions, includes) {
  return definitions.find(def => includes.some(part => def.name.toLowerCase().includes(part))) || definitions[0]
}

function variantLabel(def, familyKey) {
  const cleaned = def.name.replace(new RegExp(`^${familyKey}[-_]?`, 'i'), '')
  return titleCase(cleaned || 'Default')
}

function contractItems(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.map(item => String(item))
  if (typeof value === 'object') return Object.keys(value).map(titleCase)
  return String(value)
    .split(/[,|]/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(titleCase)
}

function contractItemsFromProps(props = {}, keys = []) {
  for (const key of keys) {
    const items = contractItems(props[key])
    if (items.length) return items
  }
  return []
}

function contractItemDescriptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [titleCase(key), String(item)]))
}

function ContractDetails({ props = {} }) {
  const rows = [
    ['Import', props.import ? [props.import] : []],
    ['Variants', contractItemsFromProps(props, ['variants'])],
    ['Sizes', contractItemsFromProps(props, ['sizes'])],
    ['States', contractItemsFromProps(props, ['states'])],
    ['Parts', contractItemsFromProps(props, ['parts'])],
    ['Notes', [props.note, props.focus, props.trigger].filter(Boolean)],
  ].filter(([, items]) => items.length)

  if (!rows.length) return null
  return (
    <div className="grid gap-3">
      {rows.map(([label, items]) => <DemoRow key={label} label={label} items={items} />)}
    </div>
  )
}

function buttonVariantStyle(name, base = {}) {
  const key = String(name || '').toLowerCase()
  const defaultBase = {
    borderRadius: base.borderRadius || '7px',
    minHeight: base.height || '32px',
    padding: base.padding || '0 14px',
  }
  if (key.includes('destructive') || key.includes('danger')) {
    return { ...defaultBase, backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }
  }
  if (key.includes('outline')) {
    return { ...defaultBase, backgroundColor: 'transparent', borderColor: 'var(--sample-border)', color: 'var(--sample-text)' }
  }
  if (key.includes('secondary')) {
    return { ...defaultBase, backgroundColor: 'var(--sample-panel)', borderColor: 'var(--sample-border)', color: 'var(--sample-text)' }
  }
  if (key.includes('ghost') || key.includes('link')) {
    return { ...defaultBase, backgroundColor: 'transparent', borderColor: 'transparent', color: 'var(--sample-text)' }
  }
  return {
    ...defaultBase,
    backgroundColor: base.backgroundColor === 'var(--sample-panel)' ? 'var(--accent)' : base.backgroundColor,
    borderColor: base.borderColor === 'var(--sample-border)' ? 'var(--accent)' : base.borderColor,
    color: base.color === 'var(--sample-text)' ? 'var(--accent-foreground)' : base.color,
  }
}

function componentStyle(props = {}) {
  const typography = typeof props.typography === 'object' && props.typography ? props.typography : {}
  return {
    backgroundColor: props.backgroundColor || props.background || 'var(--sample-panel)',
    color: props.textColor || props.color || 'var(--sample-text)',
    borderColor: props.borderColor || 'var(--sample-border)',
    borderRadius: props.rounded || props.borderRadius || '6px',
    height: props.height || undefined,
    padding: props.padding || undefined,
    fontFamily: typography.fontFamily || undefined,
    fontSize: typography.fontSize || undefined,
    fontWeight: typography.fontWeight || undefined,
    lineHeight: typography.lineHeight || undefined,
  }
}

function PropertyGrid({ props }) {
  const entries = Object.entries(props || {}).slice(0, 8)
  if (!entries.length) return null
  return (
    <div className="component-props grid gap-2 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-md border border-border p-2">
          <p className="section-label">{key}</p>
          <code className="text-xs text-muted-foreground">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</code>
        </div>
      ))}
    </div>
  )
}

function ComponentWarnings({ warnings }) {
  if (!warnings.length) return null
  return <div className="rounded-md border border-yellow-500/30 p-3 text-sm text-yellow-300">{warnings.map(w => w.message).join(' ')}</div>
}

function ComponentSource({ family }) {
  const isProse = family.definitions.every(def => def.source === 'prose')
  if (isProse) {
    return (
      <details className="border-t border-border pt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-semibold">Inferred source</summary>
        <p className="mt-2 rounded-md bg-panel-subtle p-3">This draft preview was inferred from markdown headings. Add YAML front matter under <code>components:</code> for a real contract preview.</p>
      </details>
    )
  }
  return (
    <details className="border-t border-border pt-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-semibold">YAML source</summary>
      <pre className="mt-2 overflow-auto rounded-md bg-panel-subtle p-3"><code>{yaml.dump(Object.fromEntries(family.definitions.map(def => [def.name, def.props])))}</code></pre>
    </details>
  )
}

function ComponentHeader({ family, warnings }) {
  const isProse = family.definitions.every(def => def.source === 'prose')
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="section-label">{isProse ? 'Inferred from prose' : family.type === 'generic' ? 'Generic contract preview' : 'Component playground'}</p>
        <h2 className="mt-2 text-lg font-bold">{family.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{isProse ? 'Inferred from prose' : 'From DESIGN.md contract'} · {family.definitions.length} definition{family.definitions.length === 1 ? '' : 's'}</p>
      </div>
      {warnings.length > 0 && <Badge variant="warning">{warnings.length} warning{warnings.length === 1 ? '' : 's'}</Badge>}
    </div>
  )
}

function ComponentFamily({ family }) {
  const warnings = family.definitions.flatMap(def => def.warnings || [])
  if (family.type === 'button') return <ButtonFamily family={family} warnings={warnings} />
  if (family.type === 'badge') return <BadgeFamily family={family} warnings={warnings} />
  if (family.type === 'input') return <InputFamily family={family} warnings={warnings} />
  if (family.type === 'card') return <CardFamily family={family} warnings={warnings} />
  if (family.type === 'modal') return <ModalFamily family={family} warnings={warnings} />
  if (family.type === 'toolbar') return <ToolbarFamily family={family} warnings={warnings} />
  if (family.type === 'sidebar') return <SidebarFamily family={family} warnings={warnings} />
  if (family.type === 'table') return <TableFamily family={family} warnings={warnings} />
  if (family.type === 'toast') return <ToastFamily family={family} warnings={warnings} />
  return <GenericFamily family={family} warnings={warnings} />
}

function ButtonFamily({ family, warnings }) {
  const primary = pickDefinition(family.definitions, ['primary', 'default'])
  const props = primary.resolvedProps || {}
  const style = componentStyle(props)
  const variants = contractItemsFromProps(props, ['variants'])
  const sizes = contractItemsFromProps(props, ['sizes'])
  const states = contractItemsFromProps(props, ['states'])
  const variantDescriptions = contractItemDescriptions(props.variants)
  const sizeDescriptions = contractItemDescriptions(props.sizes)
  return (
    <section className="playground-family preview-card space-y-4" data-family={family.key}>
      <ComponentHeader family={family} warnings={warnings} />

      <div className="grid gap-3 lg:grid-cols-[1.05fr_1fr]">
        <div className="playground-canvas component-canvas min-h-32 space-y-4">
          <p className="section-label">Rendered examples</p>
          <div className="flex flex-wrap items-center gap-2">
            {(variants.length ? variants : family.definitions.map(def => variantLabel(def, family.key))).slice(0, 8).map(variant => (
              <button key={variant} className="contract-button" style={buttonVariantStyle(variant, style)} type="button">{variant}</button>
            ))}
          </div>
          {!!Object.keys(variantDescriptions).length && (
            <div className="contract-definition-list">
              {Object.entries(variantDescriptions).slice(0, 6).map(([name, description]) => (
                <div key={name}><strong>{name}</strong><span>{description}</span></div>
              ))}
            </div>
          )}
        </div>
        <div className="component-controls space-y-4">
          <DemoRow label="Variants" items={variants.length ? variants : family.definitions.map(def => variantLabel(def, family.key))} />
          <div>
            <p className="section-label mb-2">States</p>
            <div className="flex flex-wrap gap-2">
              {(states.length ? states : ['Default', 'Hover', 'Active', 'Disabled']).map((state, index) => (
                <button key={state} className={cn('contract-button min-h-7 text-xs', index === 0 && 'bg-accent text-accent-foreground', state === 'Disabled' && 'opacity-45')} style={state === 'Hover' ? { ...style, filter: 'brightness(1.12)' } : state === 'Active' ? { ...style, filter: 'brightness(0.9)' } : undefined} type="button">{state}</button>
              ))}
            </div>
          </div>
          <DemoRow label="Sizes" items={sizes.length ? sizes : ['Small', 'Medium', 'Large']} />
          {!!Object.keys(sizeDescriptions).length && (
            <div className="contract-definition-list">
              {Object.entries(sizeDescriptions).slice(0, 6).map(([name, description]) => (
                <div key={name}><strong>{name}</strong><span>{description}</span></div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ContractDetails props={props} />
      <PropertyGrid props={props} />
      <ComponentWarnings warnings={warnings} />
      <ComponentSource family={family} />
    </section>
  )
}

function BadgeFamily({ family, warnings }) {
  const primary = family.definitions[0]
  const props = primary.resolvedProps || {}
  const variants = contractItemsFromProps(props, ['variants'])
  const variantDescriptions = contractItemDescriptions(props.variants)
  return (
    <section className="playground-family preview-card space-y-4" data-family={family.key}>
      <ComponentHeader family={family} warnings={warnings} />
      <div className="grid gap-3 lg:grid-cols-[1.05fr_1fr]">
        <div className="playground-canvas component-canvas space-y-4">
          <p className="section-label">Rendered examples</p>
          <div className="flex flex-wrap gap-2">
            {(variants.length ? variants : ['Default', 'Success', 'Warning', 'Danger', 'Muted']).map(variant => (
              <span key={variant} className={cn('contract-badge', `contract-badge-${slugify(variant)}`)}>{variant}</span>
            ))}
          </div>
          {!!Object.keys(variantDescriptions).length && (
            <div className="contract-definition-list">
              {Object.entries(variantDescriptions).slice(0, 8).map(([name, description]) => (
                <div key={name}><strong>{name}</strong><span>{description}</span></div>
              ))}
            </div>
          )}
        </div>
        <div className="component-controls space-y-4">
          <DemoRow label="Variants" items={variants.length ? variants : ['Default', 'Success', 'Warning', 'Danger', 'Muted']} />
          <ContractDetails props={props} />
        </div>
      </div>
      <PropertyGrid props={props} />
      <ComponentWarnings warnings={warnings} />
      <ComponentSource family={family} />
    </section>
  )
}

function InputFamily({ family, warnings }) {
  const primary = pickDefinition(family.definitions, ['field', 'default'])
  const error = pickDefinition(family.definitions, ['error'])
  const props = primary.resolvedProps || {}
  const style = componentStyle(props)
  const errorStyle = componentStyle(error?.resolvedProps || props)
  return (
    <section className="playground-family preview-card space-y-4" data-family={family.key}>
      <ComponentHeader family={family} warnings={warnings} />
      <div className="grid gap-3 md:grid-cols-[1.1fr_1fr]">
        <div className="playground-canvas component-canvas">
          <p className="section-label mb-3">Input states</p>
          <div className="grid gap-3">
            <label className="grid gap-1 text-xs text-muted-foreground">Default<input className="contract-input" style={style} placeholder="Placeholder text..." /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">With value<input className="contract-input" style={style} value="Hello, world" readOnly /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">Focus<input className="contract-input ring-2 ring-ring" style={style} value="Focused value" readOnly /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">Error<input className="contract-input" style={errorStyle} value="Invalid input" readOnly /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">Disabled<input className="contract-input opacity-55" style={style} placeholder="Placeholder text..." disabled /></label>
          </div>
        </div>
        <div className="component-controls space-y-4">
          <DemoRow label="Definitions" items={family.definitions.map(def => variantLabel(def, family.key))} />
          <DemoRow label="States" items={['Default', 'Value', 'Focus', 'Error', 'Disabled']} />
        </div>
      </div>
      <PropertyGrid props={props} />
      <ContractDetails props={props} />
      <ComponentWarnings warnings={warnings} />
      <ComponentSource family={family} />
    </section>
  )
}

function CardFamily({ family, warnings }) {
  const primary = pickDefinition(family.definitions, ['panel', 'card', 'default'])
  const props = primary.resolvedProps || {}
  const style = componentStyle(props)
  return <PreviewFamily family={family} warnings={warnings} props={props} canvas={<div className="contract-surface-card" style={style}><p className="section-label">Card</p><h3>Decision context</h3><p>Use cards for contained information, not page sections.</p></div>} />
}

function ModalFamily({ family, warnings }) {
  const primary = pickDefinition(family.definitions, ['dialog', 'modal', 'default'])
  const props = primary.resolvedProps || {}
  const style = componentStyle(props)
  return <PreviewFamily family={family} warnings={warnings} props={props} canvas={<div className="contract-modal" style={style}><p className="section-label">Modal</p><h3>Confirm action</h3><p>Explain the consequence before asking the user to proceed.</p><div className="mt-3 flex justify-end gap-2"><button className="contract-button">Cancel</button><button className="contract-button bg-accent text-accent-foreground">Continue</button></div></div>} />
}

function ToolbarFamily({ family, warnings }) {
  const primary = pickDefinition(family.definitions, ['toolbar', 'default'])
  const props = primary.resolvedProps || {}
  const style = componentStyle(props)
  return <PreviewFamily family={family} warnings={warnings} props={props} canvas={<div className="contract-toolbar" style={style}><button className="contract-button">Search</button><button className="contract-button">Save</button><button className="contract-button bg-accent text-accent-foreground">Export</button></div>} />
}

function SidebarFamily({ family, warnings }) {
  const primary = pickDefinition(family.definitions, ['sidebar', 'rail', 'default'])
  const props = primary.resolvedProps || {}
  const style = componentStyle(props)
  return <PreviewFamily family={family} warnings={warnings} props={props} canvas={<div className="contract-sidebar" style={style}><p className="section-label">Projects</p><div className="active">Design System</div><div>Marketing Site</div><div>App Shell</div></div>} />
}

function TableFamily({ family, warnings }) {
  const primary = pickDefinition(family.definitions, ['table', 'default'])
  const props = primary.resolvedProps || {}
  const style = componentStyle(props)
  return <PreviewFamily family={family} warnings={warnings} props={props} canvas={<table className="contract-table" style={style}><thead><tr><th>Token</th><th>Value</th><th>Status</th></tr></thead><tbody><tr><td>primary</td><td>#5E6DD6</td><td>Ready</td></tr><tr><td>surface</td><td>#20232B</td><td>Ready</td></tr></tbody></table>} />
}

function ToastFamily({ family, warnings }) {
  const primary = pickDefinition(family.definitions, ['toast', 'default'])
  const props = primary.resolvedProps || {}
  const style = componentStyle(props)
  return <PreviewFamily family={family} warnings={warnings} props={props} canvas={<div className="contract-toast" style={style}><strong>Design.md saved</strong><span>Changes are ready for agents.</span></div>} />
}

function GenericFamily({ family, warnings }) {
  const primary = family.definitions[0]
  const props = primary.resolvedProps || {}
  const style = componentStyle(props)
  return <PreviewFamily family={family} warnings={warnings} props={props} canvas={<div className="contract-surface-card" style={style}><p className="section-label">Generic contract preview</p><h3>{family.title}</h3><p>This family is not in the built-in registry yet, so the preview uses available surface, text, border, radius, and spacing props.</p></div>} />
}

function PreviewFamily({ family, warnings, props, canvas }) {
  return (
    <section className="playground-family preview-card space-y-4" data-family={family.key}>
      <ComponentHeader family={family} warnings={warnings} />
      <div className="playground-canvas component-canvas">{canvas}</div>
      <DemoRow label="Definitions" items={family.definitions.map(def => variantLabel(def, family.key))} />
      <ContractDetails props={props} />
      <PropertyGrid props={props} />
      <ComponentWarnings warnings={warnings} />
      <ComponentSource family={family} />
    </section>
  )
}

function DemoRow({ label, items }) {
  return (
    <div>
      <p className="section-label mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {[...new Set(items.filter(Boolean))].map((item, index) => (
          <span key={`${item}-${index}`} className={cn('contract-chip min-h-7 text-xs', index === 0 ? 'bg-accent text-accent-foreground' : 'bg-transparent')}>{item}</span>
        ))}
      </div>
    </div>
  )
}

function IssuesPreview({ analysis }) {
  const findings = [...analysis.localIssues, ...(analysis.lintReport?.findings || [])]
  return (
    <div id="issues-preview" className="preview-view space-y-3">
      {!findings.length && <div className="summary-card text-muted-foreground">No blocking issues. This DESIGN.md contract is ready to use.</div>}
      {findings.map((finding, index) => (
        <div key={index} className="summary-card">
          <Badge variant={finding.severity === 'error' ? 'error' : 'warning'}>{finding.severity || 'warning'}</Badge>
          <p className="mt-2 font-semibold">{finding.path || 'document'}</p>
          <p className="mt-1 text-sm text-muted-foreground">{finding.message}</p>
        </div>
      ))}
    </div>
  )
}

function App() {
  const [docs, setDocs] = useState([])
  const [activeFilename, setActiveFilename] = useState('')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState('Saved')
  const [theme, setTheme] = useState('dark')
  const [previewTab, setPreviewTab] = useState('document')
  const [paneMode, setPaneMode] = useState('split')
  const [railOpen, setRailOpen] = useState(true)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [lintReport, setLintReport] = useState(null)
  const [newTitle, setNewTitle] = useState('')
  const [newProject, setNewProject] = useState('')
  const [syncScroll, setSyncScroll] = useState(true)
  const [relatedComponentSources, setRelatedComponentSources] = useState([])
  const [designSources, setDesignSources] = useState([])
  const editorRef = useRef(null)
  const previewRef = useRef(null)
  const scrollSource = useRef(null)
  const saveTimer = useRef(null)

  const activeDoc = docs.find(doc => doc.filename === activeFilename) || INITIAL_DOC
  const analysis = useMemo(() => analyzeDesignDoc(content, lintReport), [content, lintReport])
  const projects = useMemo(() => groupByProject(docs), [docs])
  const activeHasRenderableComponents = hasRenderableComponents(analysis)

  useEffect(() => {
    loadDocs()
  }, [])

  useEffect(() => {
    if (!window.planAPI.onDesignDocsUpdated) return undefined
    return window.planAPI.onDesignDocsUpdated(async () => {
      const list = await window.planAPI.getDesignDocs()
      setDocs(list)
      if (window.planAPI.getDesignSources) setDesignSources(await window.planAPI.getDesignSources())
      if (!dirty && activeFilename) await openDoc(activeFilename, list)
    })
  }, [activeFilename, dirty])

  useEffect(() => {
    document.getElementById('root')?.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const onKey = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveNow()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!activeFilename || !dirty) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNow(), 700)
    return () => clearTimeout(saveTimer.current)
  }, [content, activeFilename, dirty])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!window.planAPI?.lintDesignDoc) return
      try {
        const report = await window.planAPI.lintDesignDoc(content)
        setLintReport(report)
      } catch (_) {}
    }, 500)
    return () => clearTimeout(timer)
  }, [content])

  useEffect(() => {
    let cancelled = false

    async function loadRelatedComponentContracts() {
      setRelatedComponentSources([])
      if (!activeFilename || !activeDoc?.project || activeHasRenderableComponents) return

      const sameProjectDocs = docs.filter(doc => {
        if (doc.filename === activeFilename) return false
        if ((doc.project || doc.repo) !== activeDoc.project) return false
        const pathHint = `${doc.filename} ${doc.title || ''}`.toLowerCase()
        return doc.readiness?.hasComponents || /(^|[/_-])components?([/_-]|\.md|$)/.test(pathHint)
      })

      const loaded = []
      for (const doc of sameProjectDocs.slice(0, 8)) {
        try {
          const text = await window.planAPI.getDesignDocContent(doc.filename)
          const docAnalysis = analyzeDesignDoc(text || '')
          if (hasRenderableComponents(docAnalysis)) loaded.push({ ...doc, analysis: docAnalysis })
        } catch (_) {}
      }

      if (!cancelled) setRelatedComponentSources(loaded)
    }

    loadRelatedComponentContracts()
    return () => {
      cancelled = true
    }
  }, [activeFilename, activeDoc?.project, activeHasRenderableComponents, docs])

  async function loadDocs(nextActive = activeFilename) {
    const list = await window.planAPI.getDesignDocs()
    setDocs(list)
    if (window.planAPI.getDesignSources) setDesignSources(await window.planAPI.getDesignSources())
    const target = nextActive || list[0]?.filename || ''
    if (target) await openDoc(target, list)
  }

  async function openDoc(filename, list = docs) {
    const next = await window.planAPI.getDesignDocContent(filename)
    if (next == null) return
    setActiveFilename(filename)
    setContent(next)
    setDirty(false)
    setSaveState('Saved')
    setLintReport(null)
    if (!list.find(doc => doc.filename === filename)) setDocs(await window.planAPI.getDesignDocs())
  }

  async function saveNow() {
    if (!activeFilename) return
    setSaveState('Saving')
    const ok = await window.planAPI.saveDesignDoc(activeFilename, content)
    setDirty(false)
    setSaveState(ok ? 'Saved' : 'Error')
  }

  function updateContent(value) {
    setContent(value)
    setDirty(true)
    setSaveState('Unsaved')
  }

  async function createDoc(event) {
    event.preventDefault()
    const filename = await window.planAPI.createDesignDoc(newProject || 'local', newTitle || 'DESIGN.md')
    setNewOpen(false)
    setNewTitle('')
    setNewProject('')
    await loadDocs(filename)
    ping('Created design.md')
  }

  async function linkFolder() {
    if (!window.planAPI.linkDesignFolder) {
      ping('Folder linking is unavailable')
      return
    }
    const source = await window.planAPI.linkDesignFolder()
    if (!source) return
    await loadDocs()
    ping(`Linked ${source.name || 'design folder'}`)
  }

  async function refreshDesignFolders() {
    if (window.planAPI.refreshDesignFolders) await window.planAPI.refreshDesignFolders()
    await loadDocs(activeFilename)
    ping('Design files refreshed')
  }

  async function renameDoc() {
    if (activeDoc.linked) {
      ping('Rename linked files in Finder or your editor')
      return
    }
    const current = activeFilename
    const next = window.prompt('Rename document path', current)
    if (!next || next === current) return
    const renamed = await window.planAPI.renameDesignDoc(current, next)
    if (renamed) {
      await loadDocs(renamed)
      ping('Renamed document')
    }
  }

  async function deleteDoc() {
    if (activeDoc.linked) {
      setDeleteOpen(false)
      ping('Linked files stay in their source folder')
      return
    }
    await window.planAPI.deleteDesignDoc(activeFilename)
    setDeleteOpen(false)
    const remaining = (await window.planAPI.getDesignDocs()).filter(doc => doc.filename !== activeFilename)
    setDocs(remaining)
    if (remaining[0]) await openDoc(remaining[0].filename, remaining)
    ping('Deleted document')
  }

  async function copyText(label, value) {
    try {
      await navigator.clipboard.writeText(value)
    } catch (_) {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = value || ''
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      } catch (_) {}
    }
    ping(label)
  }

  function syncScrollPosition(source, target) {
    if (!syncScroll || !source || !target) return
    const maxSource = Math.max(1, source.scrollHeight - source.clientHeight)
    const maxTarget = Math.max(0, target.scrollHeight - target.clientHeight)
    const nextTop = (source.scrollTop / maxSource) * maxTarget
    scrollSource.current = source
    target.scrollTop = nextTop
    window.requestAnimationFrame(() => {
      scrollSource.current = null
    })
  }

  function handleEditorScroll(event) {
    if (scrollSource.current === event.currentTarget) return
    syncScrollPosition(event.currentTarget, previewRef.current)
  }

  function handlePreviewScroll(event) {
    if (scrollSource.current === event.currentTarget) return
    syncScrollPosition(event.currentTarget, editorRef.current)
  }

  async function copyPath() {
    const path = await window.planAPI.getDesignDocPath(activeFilename)
    await copyText('Path copied', path)
  }

  async function revealDoc() {
    await window.planAPI.revealDesignDoc(activeFilename)
    ping('Opened in Finder')
  }

  async function exportTokens(format) {
    const result = await window.planAPI.exportDesignDoc(content, format)
    if (!result?.ok) {
      ping(result?.reason || 'Export unavailable')
      return
    }
    await copyText(format === 'tailwind' ? 'Tailwind config copied' : 'Token JSON copied', JSON.stringify(result.data, null, 2))
  }

  function insertYamlBlock(block) {
    let incoming
    try {
      incoming = yaml.load(block.content) || {}
    } catch (err) {
      ping(err?.message || 'Could not insert YAML block')
      return
    }

    const extracted = extractFrontMatter(content)
    if (extracted.hasFrontMatter && extracted.error) {
      ping('Fix front matter before inserting YAML')
      return
    }

    const body = extracted.hasFrontMatter ? extracted.body : content
    const merged = mergeDeep(extracted.data || {}, incoming)
    const nextFrontMatter = yaml.dump(merged, { lineWidth: 120, noRefs: true }).trimEnd()
    const next = `---\n${nextFrontMatter}\n---${body ? `\n\n${body.replace(/^\n+/, '')}` : '\n'}`
    setContent(next)
    setDirty(true)
    setSaveState('Unsaved')
    window.requestAnimationFrame(() => {
      const editor = editorRef.current
      editor?.focus()
      const marker = Object.keys(incoming)[0] || ''
      const cursor = marker ? next.indexOf(`${marker}:`) : nextFrontMatter.length
      editor?.setSelectionRange(Math.max(0, cursor), Math.max(0, cursor))
    })
    ping(`Merged ${block.label} into front matter`)
  }

  function insertStarterBlock(block) {
    if (!block) return
    if (block.type === 'yaml') {
      insertYamlBlock(block)
      return
    }
    const editor = editorRef.current
    const hasCursor = editor && document.activeElement === editor && typeof editor.selectionStart === 'number'
    const start = hasCursor ? editor.selectionStart : content.length
    const end = hasCursor ? editor.selectionEnd : content.length
    const before = content.slice(0, start)
    const after = content.slice(end)
    const needsBefore = before.length > 0 && !before.endsWith('\n\n')
    const needsAfter = after.length > 0 && !after.startsWith('\n\n')
    const insert = `${needsBefore ? '\n\n' : ''}${block.content.trimEnd()}${needsAfter ? '\n\n' : ''}`
    const next = `${before}${insert}${after}`
    const cursor = before.length + insert.length
    setContent(next)
    setDirty(true)
    setSaveState('Unsaved')
    window.requestAnimationFrame(() => {
      editor?.focus()
      editor?.setSelectionRange(cursor, cursor)
    })
    ping(`Inserted ${block.label}`)
  }

  function ping(message) {
    setToast(message)
    setTimeout(() => setToast(''), 1500)
  }

  const editorToggle = paneToggleMeta(paneMode, 'editor')
  const previewToggle = paneToggleMeta(paneMode, 'preview')
  const EditorToggleIcon = editorToggle.Icon
  const PreviewToggleIcon = previewToggle.Icon

  const visibleActions = (
    <div className="topbar-actions">
      <Button onClick={() => setPaletteOpen(true)} className="action-search"><Search className="h-4 w-4" /><span className="action-label">Search</span><kbd className="rounded bg-panel-strong px-1 text-[10px] text-muted-foreground">⌘K</kbd></Button>
      <Button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="hide-narrow">{theme === 'dark' ? 'Light' : 'Dark'}</Button>
      <Button onClick={() => saveNow()}>Save</Button>
      <Button onClick={() => copyText('Copied design.md', content)} className="hide-narrow">Copy design.md</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button aria-label="Insert block"><Plus className="h-4 w-4" /><span className="action-label">Insert</span></Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          {STARTER_BLOCKS.map(block => (
            <DropdownMenuItem key={block.id} onSelect={() => insertStarterBlock(block)}>Insert {block.label}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setNewOpen(true)}><FilePlus2 className="mr-2 h-4 w-4" />New design.md</DropdownMenuItem>
          <DropdownMenuItem onSelect={linkFolder}><FolderOpen className="mr-2 h-4 w-4" />Link folder…</DropdownMenuItem>
          <DropdownMenuItem onSelect={refreshDesignFolders}><RefreshCw className="mr-2 h-4 w-4" />Refresh linked folders</DropdownMenuItem>
          <DropdownMenuItem onSelect={renameDoc}>Rename document</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDeleteOpen(true)}>Delete document</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => exportTokens('dtcg')}>Copy token JSON</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => exportTokens('tailwind')}>Copy Tailwind config</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => copyText('Agent prompt copied', `Use this DESIGN.md file as the source of truth before implementing UI:\n${activeFilename}`)}>Copy agent prompt</DropdownMenuItem>
          <DropdownMenuItem onSelect={copyPath}>Copy path</DropdownMenuItem>
          <DropdownMenuItem onSelect={revealDoc}>Reveal in Finder</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  return (
    <TooltipProvider>
      <div id="app" className={cn('app-shell', !railOpen && 'rail-hidden')} data-theme={theme}>
        <aside id="vault-rail" className="vault-rail">
          <div className="traffic-spacer" />
          <div className="rail-body">
            <div className="mb-4 flex items-center justify-between">
              <span className="section-label">Projects</span>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" aria-label="Link design folder" onClick={linkFolder}><FolderOpen className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Refresh linked folders" onClick={refreshDesignFolders}><RefreshCw className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="New design.md" onClick={() => setNewOpen(true)}><FilePlus2 className="h-4 w-4" /></Button>
              </div>
            </div>
            {[...projects.entries()].map(([project, projectDocs]) => (
              <div key={project} className="mb-3">
                <div className="mb-1 flex items-center justify-between px-1 text-sm font-semibold text-muted-foreground">
                  <span>⌄ {project}</span>
                  <span>{projectDocs.length}</span>
                </div>
                {projectDocs.map(doc => (
                  <button key={doc.filename} className={cn('doc-row', doc.filename === activeFilename && 'active')} onClick={() => openDoc(doc.filename)}>
                    <span className="grid h-4 w-4 place-items-center rounded bg-panel-strong text-[10px] text-muted-foreground">#</span>
                    <span className="min-w-0">
                      <strong className="block truncate text-sm">{doc.title}</strong>
                      <span className="block truncate text-xs text-muted-foreground">{displayDocPath(doc)}</span>
                    </span>
                    <span className={cn('h-2 w-2 rounded-full', statusVariant(doc, doc.filename === activeFilename ? analysis : null) === 'success' && 'bg-emerald-400', statusVariant(doc, doc.filename === activeFilename ? analysis : null) === 'warning' && 'bg-yellow-400', statusVariant(doc, doc.filename === activeFilename ? analysis : null) === 'muted' && 'bg-muted-foreground')} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <main className="workspace">
          <header className="topbar">
            <div className="flex min-w-0 items-center gap-3">
              <Button size="icon" variant="ghost" aria-label="Toggle vault" onClick={() => setRailOpen(!railOpen)}><Menu className="h-4 w-4" /></Button>
              <h1 className="truncate text-sm font-bold">{analysis.data.name || activeDoc.title || 'Untitled'}</h1>
            </div>
            {visibleActions}
          </header>

          <div className={cn('pane-toolbar', paneMode !== 'split' && 'single-pane-toolbar')}>
            <div className={cn('pane-title', paneMode === 'preview' && 'hidden')}>
              <span className="section-label">Markdown editor</span>
              <Button size="icon" variant="ghost" className="ml-auto" aria-label={editorToggle.label} onClick={() => setPaneMode(editorToggle.next)}><EditorToggleIcon className="h-4 w-4" /></Button>
            </div>
            <div className={cn('pane-title preview-title', paneMode === 'editor' && 'hidden')}>
              <span className="section-label">Live preview</span>
              <Tabs value={previewTab} onValueChange={setPreviewTab} className="min-w-0 flex-1">
                <TabsList className="preview-segmented-tabs">
                  <TabsTrigger value="document">Document</TabsTrigger>
                  <TabsTrigger value="tokens">Tokens</TabsTrigger>
                  <TabsTrigger value="components">Components</TabsTrigger>
                  <TabsTrigger value="issues">Issues</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button size="icon" variant="ghost" aria-label={previewToggle.label} onClick={() => setPaneMode(previewToggle.next)}><PreviewToggleIcon className="h-4 w-4" /></Button>
            </div>
          </div>

          <PanelGroup direction="horizontal" className="split-area">
            {paneMode !== 'preview' && (
              <Panel minSize={30} defaultSize={paneMode === 'editor' ? 100 : 50}>
                <section className="h-full">
                  <div className="editor-shell">
                    <pre className="line-numbers" aria-hidden="true">{lineNumbers(content)}</pre>
                    <textarea ref={editorRef} className="markdown-editor" spellCheck="false" autoComplete="off" wrap="off" aria-label="Markdown editor" value={content} onChange={event => updateContent(event.target.value)} onScroll={handleEditorScroll} />
                  </div>
                </section>
              </Panel>
            )}
            {paneMode === 'split' && <PanelResizeHandle className="w-px bg-border" />}
            {paneMode !== 'editor' && (
              <Panel minSize={30} defaultSize={paneMode === 'preview' ? 100 : 50}>
                <section className="preview-pane h-full">
                  <div id="preview-scroll" ref={previewRef} className="preview-scroll" onScroll={handlePreviewScroll}>
                    {previewTab === 'document' && <DocumentPreview analysis={analysis} />}
                    {previewTab === 'tokens' && <TokensPreview analysis={analysis} />}
                    {previewTab === 'components' && <ComponentsPreview analysis={analysis} relatedComponentSources={relatedComponentSources} onOpenSource={openDoc} />}
                    {previewTab === 'issues' && <IssuesPreview analysis={analysis} />}
                  </div>
                </section>
              </Panel>
            )}
          </PanelGroup>

          <footer className="statusbar">
            <span className={saveState === 'Unsaved' ? 'text-yellow-400' : ''}>{saveState}</span>
            <span>{stats(content)}</span>
            <label className="flex items-center gap-2"><input type="checkbox" checked={syncScroll} onChange={event => setSyncScroll(event.target.checked)} /> Sync scroll</label>
          </footer>
        </main>

        <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
          <CommandInput placeholder="Open file or run action…" />
          <CommandList>
            <CommandEmpty className="p-4 text-sm text-muted-foreground">No results found.</CommandEmpty>
            <CommandGroup heading="Documents">
              {docs.map(doc => (
                <CommandItem key={doc.filename} value={`${doc.title} ${displayDocPath(doc)} ${doc.project}`} onSelect={() => { openDoc(doc.filename); setPaletteOpen(false) }}>
                  <span className="grid h-4 w-4 place-items-center rounded bg-panel-strong text-[10px]">#</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{doc.title}</span>
                  <span className="text-xs text-muted-foreground">{doc.project}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Commands">
              <CommandItem onSelect={() => { setNewOpen(true); setPaletteOpen(false) }}>Create new design.md</CommandItem>
              <CommandItem onSelect={() => { linkFolder(); setPaletteOpen(false) }}>Link design folder</CommandItem>
              <CommandItem onSelect={() => { refreshDesignFolders(); setPaletteOpen(false) }}>Refresh linked folders</CommandItem>
              <CommandItem onSelect={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setPaletteOpen(false) }}>Toggle theme</CommandItem>
              <CommandItem onSelect={() => { editorRef.current?.focus(); setPaletteOpen(false) }}>Focus editor</CommandItem>
              <CommandItem onSelect={() => { setPaneMode('split'); setPaletteOpen(false) }}>Show split view</CommandItem>
              <CommandItem onSelect={() => { setPaneMode('editor'); setPaletteOpen(false) }}>Expand editor</CommandItem>
              <CommandItem onSelect={() => { setPaneMode('preview'); setPaletteOpen(false) }}>Expand preview</CommandItem>
            </CommandGroup>
            <CommandGroup heading="Insert blocks">
              {STARTER_BLOCKS.map(block => (
                <CommandItem key={block.id} value={`insert ${block.label} ${block.id}`} onSelect={() => { insertStarterBlock(block); setPaletteOpen(false) }}>
                  <span className="grid h-4 w-4 place-items-center rounded bg-panel-strong text-[10px]">+</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">Insert {block.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="flex justify-end gap-4 border-t border-border p-2 text-xs text-muted-foreground"><span>↑↓ Navigate</span><span>Enter Run</span><span>Esc Close</span></div>
        </CommandDialog>

        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogContent>
            <DialogTitle>Create DESIGN.md</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Create a root or scoped design contract, for example DESIGN.md or components/table/DESIGN.md.</DialogDescription>
            <form className="grid gap-3" onSubmit={createDoc}>
              <Label>Document path<Input aria-label="Document path" value={newTitle} onChange={event => setNewTitle(event.target.value)} placeholder="components/table/DESIGN.md" required /></Label>
              <Label>Project folder<Input aria-label="Project folder" value={newProject} onChange={event => setNewProject(event.target.value)} placeholder="plan-viewer" /></Label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
                <Button type="submit">Create file</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">This removes {activeFilename} from the local vault.</AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel asChild><Button variant="ghost">Cancel</Button></AlertDialogCancel>
              <AlertDialogAction asChild><Button variant="destructive" onClick={deleteDoc}><Trash2 className="h-4 w-4" />Delete</Button></AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {toast && <div className="fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-border bg-panel-strong px-4 py-2 text-sm shadow-soft">{toast}</div>}
      </div>
    </TooltipProvider>
  )
}

createRoot(document.getElementById('root')).render(<App />)
