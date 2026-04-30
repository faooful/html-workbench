(function () {
  if (window.planAPI) return
  if (!location.pathname.includes('__desktop-test') && !location.search.includes('testApi=1')) return

  const now = new Date().toISOString()
  const store = new Map()
  store.set('plan-viewer/design.md', `---
version: alpha
name: Product Design Language
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

# Product Design Language

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

  function docs() {
    return [...store.entries()].map(([filename, content]) => ({
      filename,
      kind: 'design-doc',
      title: content.match(/^#\s+(.+)$/m)?.[1] || filename,
      repo: filename.split('/')[0],
      project: filename.split('/')[0],
      path: `/mock/design-docs/${filename}`,
      modified: now,
      created: now,
      source: 'design-doc',
      status: content.startsWith('---\n') ? 'ready' : 'needs_structure',
      readiness: { state: content.startsWith('---\n') ? 'ready' : 'needs_structure', warnings: [] },
      summary: content.slice(0, 240),
    }))
  }

  window.planAPI = {
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
      const cleanTitle = String(title || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'design'
      const filename = `${cleanProject}/${cleanTitle}.md`
      store.set(filename, `---\nversion: alpha\nname: ${title}\ncolors:\n  primary: "#5E6DD6"\ntypography:\n  body-md:\n    fontFamily: Geist\n    fontSize: 15px\n    fontWeight: 400\n    lineHeight: 1.6\ncomponents:\n  button-primary:\n    backgroundColor: "{colors.primary}"\n    textColor: "#ffffff"\n---\n\n# ${title}\n\n## Overview\n\nDescribe the product direction.\n\n## Components\n\nDocument important component behavior.\n`)
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
    onPlanUpdated: () => {},
  }
})()
