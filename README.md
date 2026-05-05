# DESIGN.md Workbench

DESIGN.md Workbench is a local-first Electron app for authoring, reviewing, and exporting `DESIGN.md` design contracts for AI implementation agents. It keeps the markdown source and rendered previews side by side so humans can judge the visual system before agents apply it in code.

## What It Does

- Stores local design contracts under `design-docs/`.
- Links external folders of `.md` design contracts without copying files.
- Provides a split markdown editor and live preview.
- Renders document, token, component, and issue views from YAML front matter and markdown.
- Supports starter YAML blocks for tokens, typography, components, and agent rules.
- Lints contracts with `@google/design.md` when available.
- Exports token JSON and Tailwind config to the clipboard.

## Tech Stack

- Electron 41 for the desktop shell.
- Node.js main process for local file access, folder linking, IPC, and file watching.
- React, Tailwind CSS, and Radix/shadcn-style primitives for the renderer.
- `marked` for markdown rendering.
- `js-yaml` for front matter and starter block merging.
- Playwright for visual and interaction coverage.

## Project Layout

```text
design-md-workbench/
├── main.js                 # Electron main process and design-doc IPC
├── preload.js              # Context bridge exposing window.designAPI
├── package.json            # npm scripts and dependencies
├── renderer/
│   ├── index.html          # Renderer shell
│   ├── test-api.js         # Browser-only mock designAPI for Playwright
│   └── src/
│       ├── App.jsx         # React workbench UI
│       ├── styles.css      # Tailwind entrypoint and app CSS
│       └── components/     # Local UI primitives
├── tests/
│   └── ui.visual.spec.js   # Playwright visual/interaction tests
└── design-docs/            # Local runtime design contracts, ignored by Git
```

Generated renderer assets are ignored by Git:

```text
renderer/app.css
renderer/app.bundle.js
```

## Setup

Install dependencies:

```sh
npm install
```

## Running The App

Start the Electron app:

```sh
npm start
```

On launch, the app:

1. Ensures `design-docs/` exists.
2. Creates a starter `design-md-workbench/design.md` if no local starter exists.
3. Opens the React workbench.
4. Watches local and linked design folders for `.md` changes.

## Scripts

```sh
npm run build:renderer
npm run test:ui
npm run test:visual
```

`npm run build:renderer` generates the ignored renderer CSS and JavaScript bundle. The test scripts build the renderer first, then load `renderer/index.html?testApi=1` with the browser-only mock API.

## Runtime State

These files are generated locally and ignored by Git:

```text
.design-sources.json       # Linked design folders
design-docs/               # Local design contracts
renderer/app.css           # Generated Tailwind output
renderer/app.bundle.js     # Generated React bundle
.ui-artifacts/             # Test screenshots
test-results/
playwright-report/
```

Existing ignored plan-review data from earlier versions can remain on disk, but the app no longer reads or exposes it.
