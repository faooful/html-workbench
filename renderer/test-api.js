(function () {
  if (window.planAPI) return
  if (!location.pathname.includes('__desktop-test') && !location.search.includes('testApi=1')) return

  const now = new Date().toISOString()
  const store = new Map()
  store.set('plan-viewer/design.md', `# Product Design Language

## Purpose

This document teaches coding agents how to apply the product's design language when implementing UI.

## Design Principles

- Calm surfaces before decorative effects.
- One clear primary action per context.
- Status should guide decisions without becoming noise.

## Visual Language

The app should feel like a focused local document workspace: quiet, precise, and useful.

## Tokens

- Accent: #5E6DD6
- Background: #17191F
- Background Subtle: rgba(255, 255, 255, 0.08)
- Text Primary: rgba(245, 255, 255, 0.94)
- Radius: 8px
- Large Radius: 14px
- Font: SF Pro

## Components

### Button

Variants: Primary, Secondary, Ghost
Sizes: Small, Medium, Large
States: Default, Hover, Disabled

### Input

Variants: Default, With value, Disabled
Sizes: Small, Medium, Large

### Composer

Variants: Hero, Compact
Sizes: Compact, Expanded
States: Empty, Focused, Streaming, With attachments

### Auto Approve Toggle

Variants: Off, On
Sizes: Mini
States: Default, Hover, Active, Disabled

### Widget Container

Variants: Dashboard, JSON, Canvas
Sizes: Small, Medium, Large
States: Empty, Loading, Populated, Error

## Agent Implementation Rules

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

  function docs() {
    return [...store.entries()].map(([filename, content]) => ({
      filename,
      kind: 'design-doc',
      title: content.match(/^#\s+(.+)$/m)?.[1] || filename,
      repo: filename.split('/')[0],
      project: filename.split('/')[0],
      modified: now,
      created: now,
      source: 'design-doc',
      status: 'draft',
      summary: content.slice(0, 240),
    }))
  }

  window.planAPI = {
    getDesignDocs: async () => docs(),
    getDesignDocContent: async filename => store.get(filename) || null,
    saveDesignDoc: async (filename, content) => {
      store.set(filename, content)
      return filename
    },
    createDesignDoc: async (project, title) => {
      const cleanProject = String(project || 'local').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'local'
      const cleanTitle = String(title || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'design'
      const filename = `${cleanProject}/${cleanTitle}.md`
      store.set(filename, `# ${title}\n\n## Purpose\n\nDescribe the product direction.\n\n## Tokens\n\n- Accent: #5E6DD6\n\n## Components\n\n### Button\n\nVariants: Primary, Secondary\n`)
      return filename
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
    getPrefs: async () => ({}),
    setPrefs: async () => true,
    getSharingInfo: async () => ({ url: 'http://127.0.0.1:3847/' }),
    onPlanUpdated: () => {},
  }
})()
