# Plan Viewer

Plan Viewer is a local Electron app for browsing, reviewing, annotating, and sharing AI-generated implementation plans written by Claude. It watches Claude's plan directory, keeps a local archive of Markdown plans, marks new or changed plans as live, and gives you a focused review surface before sending approval or revision feedback back to Claude.

The app also starts a small local HTTP server so plans can be opened from a browser on the same network. Browser mode is read-only for plan content, but collaborators can add comments that sync back to the desktop app.

## What It Does

- Syncs Markdown plans from `~/.claude/plans/` into the local `plans/` archive.
- Shows live plans that are awaiting review or approval.
- Groups plans by source repository when metadata can be inferred from Claude project history.
- Renders Markdown plans in a reader-friendly interface.
- Supports comments on selected text, stored beside each plan as JSON.
- Builds a feedback message from comments that can be pasted back into Claude Code.
- Keeps snapshots when synced plans change, so earlier versions can be reviewed.
- Shows line-based diffs between a historical snapshot and the current version.
- Provides a step-through mode that splits plans by `##` sections.
- Exposes a browser share view over the local network on port `3847`.

## Tech Stack

- Electron 41 for the desktop shell.
- Node.js main process for file watching, IPC, snapshots, and HTTP routes.
- Chokidar 5 for watching Claude's plan directory.
- Vanilla JavaScript, HTML, and CSS for the renderer.
- marked.js for Markdown rendering.
- Server-sent events for browser-mode live updates.
- esbuild for the currently unused `@pierre/diffs` browser bundle.

There is intentionally no frontend framework in this project.

## Project Layout

```text
plan-viewer/
├── main.js                 # Electron main process, IPC, HTTP server, sync logic
├── preload.js              # Context bridge exposing window.planAPI
├── package.json            # npm scripts and dependencies
├── renderer/
│   ├── index.html          # Electron desktop UI
│   ├── web.html            # Browser/share UI
│   ├── renderer.js         # UI state and behavior
│   ├── styles.css          # App styling
│   ├── web-api.js          # Browser-mode replacement for Electron IPC
│   ├── marked.min.js       # Markdown renderer
│   └── pierre-diffs.bundle.js
├── scripts/
│   └── bundle-diffs.js     # Builds the pierre-diffs browser bundle
└── plans/
    └── .gitkeep            # Local plan archive lives here at runtime
```

Runtime plan data is ignored by Git. The `plans/` directory is committed only as an empty placeholder.

## Setup

Install dependencies:

```sh
npm install
```

Claude Code should be configured normally on the same machine. Plan Viewer expects Claude-generated plans to appear in:

```text
~/.claude/plans/
```

If that directory does not exist yet, the app will still launch, but there will be no plans to sync until Claude creates some.

## Running the App

Start the Electron app:

```sh
npm start
```

On launch, the app:

1. Ensures the local `plans/` and `plans/.snapshots/` directories exist.
2. Loads remembered live-plan state.
3. Copies any newer Markdown plans from `~/.claude/plans/`.
4. Starts the browser sharing server on port `3847`.
5. Opens the Electron window.

The sharing URL is shown in the app sidebar when available. It uses your local network IP:

```text
http://<local-ip>:3847
```

## Browser Sharing

The local HTTP server is started automatically by `main.js`. Browser mode uses `renderer/web.html` and `renderer/web-api.js` instead of Electron IPC.

Available HTTP endpoints include:

- `GET /api/plans`
- `GET /api/plans/:filename`
- `GET /api/plans/:filename/comments`
- `POST /api/plans/:filename/comments`
- `GET /api/snapshots/:filename`
- `GET /api/snapshots/:filename/:timestamp`
- `GET /api/events`

Browser clients receive updates over server-sent events. Plan content is read-only in browser mode, but comments can be added and are broadcast back to connected clients and the Electron app.

Important: the sharing server is unauthenticated and listens on `0.0.0.0`. Only run it on networks where exposing local plan content is acceptable.

## Data Flow

### Plan Sync

1. Chokidar watches `~/.claude/plans/`.
2. When a Markdown plan is added or changed, the app copies it into `plans/`.
3. If the local archive already has different content, the old content is saved as a snapshot first.
4. The plan is marked live and the app broadcasts the update through IPC and SSE.
5. The renderer refreshes its plan list and opens newly live plans automatically.

### Comments

Comments are stored as sibling JSON files beside the archived plan:

```text
plans/example-plan.comments.json
```

Each comment records the selected quote, note text, timestamp, and optional browser-mode author name. Comment highlights are reapplied by finding the quoted text in the rendered Markdown.

### Snapshots

Before a changed plan overwrites the archived copy, the previous content is saved here:

```text
plans/.snapshots/<plan-stem>/<epoch-ms>.md
```

The renderer lists those snapshots as versions in the sidebar. When viewing a snapshot, the Diff button compares that historical version against the current plan.

## Local State Files

These files are generated locally and ignored by Git:

```text
.live-plans.json          # Array of filenames currently marked live
.prefs.json               # Last-opened plan and other local preferences
plans/*.md                # Synced plan archive
plans/*.comments.json     # Per-plan comments
plans/.snapshots/         # Historical plan versions
```

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd+K` | Open command palette |
| `Cmd+F` | Focus sidebar search |
| `Cmd+[` | Previous plan |
| `Cmd+]` | Next plan |
| `Up` / `Down` | Navigate plans, or steps in step-through mode |
| `Cmd+Enter` | Add a comment to selected text |
| `Escape` | Close palette, exit step mode, or dismiss comment UI |

## Main Files

### `main.js`

Owns the Electron lifecycle, the local sharing server, plan sync, snapshot creation, live-plan state, metadata extraction, and IPC handlers.

### `preload.js`

Exposes a narrow `window.planAPI` bridge to the renderer via Electron's `contextBridge`. The renderer does not access Node APIs directly.

### `renderer/renderer.js`

Contains all desktop and browser UI behavior:

- plan list rendering
- search and command palette
- repo grouping and pagination
- Markdown preview
- comments and highlights
- version listing
- line diff rendering
- step-through mode
- table of contents
- live-plan approval flow
- browser-mode SSE handling

### `renderer/web-api.js`

Implements the same `window.planAPI` surface for browser mode using `fetch`, `EventSource`, and `localStorage`.

## Development Notes

Run the app during development with:

```sh
npm start
```

Rebuild the currently unused pierre-diffs bundle with:

```sh
npm run bundle
```

The app is mostly a single-file vanilla renderer right now. For larger changes, the safest pattern is to keep behavior close to the existing DOM/state style unless you are intentionally extracting modules.

## Known Gaps

- Search does not index full plan body content.
- Comment anchoring is quote-based and can fail if plan text changes.
- Trigger extraction depends on Claude JSONL history shape and can be fragile.
- The browser sharing server has no authentication.
- Some CSS is stale or needs accessibility polish, especially focus states.
- There is no dark mode.

