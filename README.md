# Accidental Design System

Accidental Design System is a local-first Electron app for inspecting the design system that already exists inside a repo. Link one folder, scan suggested sources, and browse the discovered components, tokens, colors, classes, files, and guidance in one dense table.

The app is read-only. It does not call an LLM, generate code, or write into linked repos.

## What It Does

- Links local repos and remembers them in ignored local state.
- Suggests likely design docs, theme files, component folders, and UI surfaces.
- Scans one selected repo at a time; inventories are never merged across repos.
- Shows a table of discovered design-system facts with filters for `Components`, `Tokens`, `Colors`, `Classes`, and `Files`.
- Opens row-level evidence in a right-side detail panel with files, counts, line matches, import paths, color context, and suggested alternatives when available.
- Keeps source include/exclude controls behind `Scan Settings`.
- Copies a concise summary for humans or agents when needed.

## Tech Stack

- Electron 41 for the desktop shell.
- Node.js main process for local repo linking, source suggestion, static scanning, and IPC.
- React, Tailwind CSS, and Radix/shadcn-style primitives for the renderer.
- Playwright for visual and interaction coverage.

## Running

```sh
npm install
npm start
```

On launch, the current repo is available as a dogfood target. Use **Link repo** to add another local project.

## Scripts

```sh
npm run build:renderer
npm run test:ui
npm run test:visual
```

Generated renderer assets are ignored by Git:

```text
renderer/app.css
renderer/app.bundle.js
```

## Runtime State

These files are generated locally and ignored by Git:

```text
.design-repos.json         # Linked repos and source-map choices
renderer/app.css           # Generated Tailwind output
renderer/app.bundle.js     # Generated React bundle
.ui-artifacts/             # Test screenshots
test-results/
playwright-report/
```
