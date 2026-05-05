(function () {
  if (window.designAPI) return
  if (!location.pathname.includes('__desktop-test') && !location.search.includes('testApi=1')) return

  const now = new Date().toISOString()
  const store = new Map()
  const persistedLinked = JSON.parse(localStorage.getItem('design-md-linked-sources') || '[]')
  store.set('design-md-workbench/design.md', `---
version: alpha
name: DESIGN.md Workbench Design Language
description: Local design contract for implementation agents.
colors:
  primary: "#5E6DD6"
  secondary: "#8B949E"
  neutral: "#17191F"
  surface: "#20232B"
  on-surface: "#F2F4F8"
typography:
  headline-md:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: 650
    lineHeight: 1.12
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
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    height: 32px
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: 8px
---

# DESIGN.md Workbench Design Language

## Overview

This document teaches coding agents how to apply the product's design language when implementing UI.

## Colors

Primary blue drives action, neutral panels hold editor and preview surfaces.

## Typography

The app should feel like a focused local document workspace: quiet, precise, and useful.

## Layout

Dense split panes keep the markdown contract and rendered output visible together.

## Components

Buttons should stay compact, high contrast, and clear about primary vs secondary actions.

## Do's and Don'ts

- Read this design.md before changing UI.
- Reuse documented tokens and component patterns.
- Ask before inventing a new visual pattern.
`)
  store.set('marketing-site/design.md', `# Marketing Site Design

## Purpose

Document the public website design language.

## Tokens

- Accent: #2ABBF7
- Background: #0F1117
- Text: #F6F7FB

## Components

### Link Button

Variants: Primary, Secondary
Sizes: Small, Medium
States: Default, Disabled
`)
  store.set('BitsApp/bits.md', `---
name: Bits Chat & Workspace
description: Workspace-level design guidance.
---

# Bits Chat & Workspace

## Workspace

This file documents chat, panes, and streaming behavior. Component primitives live in components.md.
`)
  store.set('BitsApp/components.md', `---
name: Bits Primitive Components
---

# Bits Primitive Components

## Gotchas

Primitive UI wrappers live at \`@bits/gui/core/components/ui/button.tsx\`, \`@bits/gui/core/components/ui/input.tsx\`, \`@bits/gui/core/components/ui/badge.tsx\`, \`@bits/gui/core/components/ui/dropdown-menu.tsx\`, and \`@bits/gui/core/components/ui/command.tsx\`.

Use \`Button\` for primary actions, destructive actions, secondary outline actions, and text links.
Use \`Input\` for default, focus, error, and disabled states.
Use \`Empty\`, \`Skeleton\`, and \`Spinner\` for loading and zero-state surfaces.
`)

  const linkedSources = persistedLinked
  linkedSources.forEach(source => {
    if (source.id === 'mock' && !store.has('linked/mock/tokens.md')) {
      addMockLinkedFolderFiles()
    }
  })

  function persistLinkedSources() {
    localStorage.setItem('design-md-linked-sources', JSON.stringify(linkedSources))
  }

  function addMockLinkedFolderFiles() {
    store.set('linked/mock/tokens.md', `---
name: External Tokens
colors:
  primary: "#33AAFF"
typography:
  body-md:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
---

# External Tokens

## Overview

This file is read from a linked design folder.
`)
  }

  function docProject(filename) {
    if (filename.startsWith('linked/mock/')) return 'external-design'
    return filename.split('/')[0]
  }

  function docDisplayPath(filename) {
    if (filename.startsWith('linked/mock/')) return filename.replace('linked/mock/', '')
    return filename
  }

  function docs() {
    return [...store.entries()].map(([filename, content]) => ({
      filename,
      displayPath: docDisplayPath(filename),
      kind: 'design-doc',
      title: content.match(/^name:\s*"?([^"\n]+)"?/m)?.[1] || content.match(/^#\s+(.+)$/m)?.[1] || filename,
      repo: docProject(filename),
      project: docProject(filename),
      path: `/mock/design-docs/${filename}`,
      modified: now,
      created: now,
      source: filename.startsWith('linked/mock/') ? 'linked-folder' : 'design-doc',
      sourceName: filename.startsWith('linked/mock/') ? 'external-design' : docProject(filename),
      sourceRoot: filename.startsWith('linked/mock/') ? '/mock/external-design' : '/mock/design-docs',
      linked: filename.startsWith('linked/mock/'),
      status: content.startsWith('---\n') ? 'ready' : 'needs_structure',
      readiness: { state: content.startsWith('---\n') ? 'ready' : 'needs_structure', warnings: [] },
      summary: content.slice(0, 240),
    }))
  }

  window.designAPI = {
    getDesignDocs: async () => docs(),
    getDesignDocContent: async filename => store.get(filename) || null,
    getDesignDocPath: async filename => `/mock/design-docs/${filename}`,
    revealDesignDoc: async filename => store.has(filename),
    saveDesignDoc: async (filename, content) => {
      store.set(filename, content)
      return filename
    },
    createDesignDoc: async (project, title) => {
      const cleanProject = String(project || 'local').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'local'
      const rawTitle = String(title || 'DESIGN.md').trim()
      const hasPathIntent = /[\\/]/.test(rawTitle) || /\.md$/i.test(rawTitle)
      const cleanTitle = rawTitle.toLowerCase().replace(/[^a-z0-9./_-]+/g, '-').replace(/^\/+/, '') || 'DESIGN.md'
      const filename = hasPathIntent
        ? `${cleanProject}/${cleanTitle.endsWith('.md') ? cleanTitle : `${cleanTitle}/DESIGN.md`}`
        : `${cleanProject}/${cleanTitle.replace(/[^a-z0-9]+/g, '-')}.md`
      const parts = filename.split('/')
      const stem = parts[parts.length - 2] || parts[parts.length - 1].replace(/\.md$/i, '')
      const displayName = stem.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Design'
      store.set(filename, `---\nversion: alpha\nname: ${displayName} Design\ncolors:\n  primary: "#5E6DD6"\ntypography:\n  body-md:\n    fontFamily: Geist\n    fontSize: 15px\n    fontWeight: 400\n    lineHeight: 1.6\ncomponents:\n  button-primary:\n    backgroundColor: "{colors.primary}"\n    textColor: "#ffffff"\n---\n\n# ${displayName} Design\n\n## Overview\n\nDescribe the product direction.\n\n## Components\n\nDocument important component behavior.\n`)
      return filename
    },
    linkDesignFolder: async () => {
      const source = { id: 'mock', name: 'external-design', path: '/mock/external-design' }
      if (!linkedSources.find(item => item.id === source.id)) linkedSources.push(source)
      persistLinkedSources()
      addMockLinkedFolderFiles()
      return source
    },
    getDesignSources: async () => linkedSources,
    refreshDesignFolders: async () => docs(),
    unlinkDesignFolder: async sourceId => {
      const index = linkedSources.findIndex(item => item.id === sourceId)
      if (index >= 0) linkedSources.splice(index, 1)
      persistLinkedSources()
      return true
    },
    renameDesignDoc: async (filename, nextFilename) => {
      const content = store.get(filename)
      if (!content) return null
      const next = nextFilename.endsWith('.md') ? nextFilename : `${nextFilename}.md`
      store.delete(filename)
      store.set(next, content)
      return next
    },
    deleteDesignDoc: async filename => store.delete(filename),
    onDesignDocsUpdated: () => () => {},
    lintDesignDoc: async content => ({
      ok: true,
      summary: { errors: 0, warnings: content.includes('broken-ref') ? 1 : 0, infos: 1 },
      findings: content.includes('broken-ref') ? [{ severity: 'warning', path: 'components.button', message: 'Unresolved token reference {colors.broken-ref}.' }] : [],
      tailwindConfig: { success: true, data: { theme: { extend: { colors: { primary: '#5E6DD6' } } } } },
      dtcg: { success: true, data: { color: { primary: { $value: '#5E6DD6', $type: 'color' } } } },
    }),
    exportDesignDoc: async (content, format) => ({
      ok: true,
      data: format === 'tailwind'
        ? { theme: { extend: { colors: { primary: '#5E6DD6' } } } }
        : { color: { primary: { $value: '#5E6DD6', $type: 'color' } } },
    }),
  }
})()
