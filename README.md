# HTML Workbench

HTML Workbench is a local-first desktop app for creating, editing, and rendering `.html` files side by side. It is built for turning working notes, implementation plans, UI specs, prototypes, and agent handoff docs into real HTML artifacts that live on your machine.

The project also includes a small marketing website entry for `html-render`, while the Electron app keeps its own renderer entry so the product UI and website UI stay separate.

## Product Demos

### Side-by-side HTML editing

<video src="https://github.com/faooful/html-workbench/raw/main/src/assets/html-render-editor.mp4" controls muted loop playsinline width="100%"></video>

### Sync scrolling between source and preview

<video src="https://github.com/faooful/html-workbench/raw/main/src/assets/html-render-sync-scroll.mp4" controls muted loop playsinline width="100%"></video>

### Local HTML library workflow

<video src="https://github.com/faooful/html-workbench/raw/main/src/assets/html-render-new-file.mp4" controls muted loop playsinline width="100%"></video>

## What It Does

- Keeps a local `html-files/` library of user-created `.html` documents.
- Lists saved files by recent activity and restores the last opened document.
- Provides a split HTML editor and live rendered preview.
- Supports editor-only, preview-only, and split-pane modes.
- Updates the preview without reloading the iframe on every keystroke.
- Autosaves changes back to disk with a configurable delay.
- Adds optional sync scrolling between the source pane and preview pane.
- Creates, renames, deletes, reveals, and opens HTML files through Electron IPC.
- Includes slash snippets for plans, prototypes, requirements, tables, decisions, and common HTML blocks.
- Includes HTML tag completion for faster authoring.
- Provides a command palette for file navigation, view modes, save actions, copy actions, and preferences.

## Common Uses

- Draft implementation plans as HTML documents that agents can consume directly.
- Build lightweight UI specs with inline prototypes and acceptance criteria.
- Keep local project notes in durable `.html` files instead of a hosted document system.
- Preview standalone HTML artifacts while editing the source.
- Create agent briefs where the file path and full document content can be copied together.
- Maintain a small local library of reusable specs, prototypes, and notes.

## Project Structure

```text
src/main.tsx        # Electron app renderer
src/styles.css      # Electron app styling
src/app.html        # Electron app HTML entry
src/website.tsx     # Marketing website renderer
src/website.css     # Marketing website styling
src/index.html      # Marketing website HTML entry
main.js             # Electron main process
preload.js          # Electron preload API bridge
html-files/         # Local HTML document library
```

The Vite build emits both entries:

```text
dist/renderer/app.html      # Loaded by Electron
dist/renderer/index.html    # Marketing website
```

## Tech Stack

- Electron 41 for the desktop shell.
- React 19 + Vite for renderer builds.
- Tailwind CSS 4 with local shadcn-style sidebar primitives.
- Geist and Geist Mono variable fonts.
- Lucide React icons.

## Running The App

```sh
npm install
npm start
```

`npm start` builds the renderers into `dist/renderer/` and launches Electron against `dist/renderer/app.html`.

## Building

```sh
npm run build
```

This builds both the desktop app entry and the marketing website entry.

## Runtime State

These files are generated locally and ignored by Git:

```text
html-files/*.html         # Local HTML documents edited by the app
dist/                     # Built renderer output
```

The `html-files/` directory is kept in Git with `.gitkeep` so the app has an obvious local library location.
