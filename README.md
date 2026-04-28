# Plan Memory Review Inbox

Plan Memory Review Inbox is a local-first Electron app for reviewing AI-generated implementation plans before they touch your codebase. It captures plans from Claude and Codex, keeps a durable local archive, tracks review decisions over time, and gives you an audit trail of what agents proposed, what changed, what was approved, and why.

The app also starts a small local HTTP server so plans can be opened from a browser on the same network. Browser mode is read/comment-oriented; host-only review decisions stay in the desktop app.

## What It Does

- Syncs Claude Markdown plans from `~/.claude/plans/` and Codex proposed plans from `~/.codex/sessions/` into the local `plans/` archive.
- Shows live plans that are awaiting review or approval, with review-first filters in the command palette.
- Groups plans by source repository when metadata can be inferred from Claude/Codex history.
- Renders Markdown plans in a reader-friendly interface.
- Supports typed annotations on selected text, stored beside each plan as JSON.
- Tracks checklist state, review decisions, and a per-plan timeline in local sidecar files.
- Builds approval or grouped change-request messages that can be pasted back into an agent.
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

Claude Code and/or Codex should be configured normally on the same machine. Claude-generated plans are synced from:

```text
~/.claude/plans/
```

Codex proposed plans are extracted from:

```text
~/.codex/sessions/**/*.jsonl
```

If neither source exists yet, the app will still launch with onboarding instructions.

## Running the App

Start the Electron app:

```sh
npm start
```

On launch, the app:

1. Ensures the local `plans/` and `plans/.snapshots/` directories exist.
2. Loads remembered live-plan state.
3. Copies any newer Claude plans and imports any new Codex proposed plans.
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

Browser clients receive updates over server-sent events. Plan content is read-only in browser mode, comments can be added, and review decisions remain host-only.

Important: the sharing server is unauthenticated and listens on `0.0.0.0`. Only run it on trusted networks where exposing local plan content is acceptable.

## Data Flow

### Plan Sync

1. Chokidar watches `~/.claude/plans/` and `~/.codex/sessions/`.
2. When a Claude plan is added/changed or a Codex proposed plan is found, the app copies/imports it into `plans/`.
3. If the local archive already has different content, the old content is saved as a snapshot first.
4. The plan is marked live and the app broadcasts the update through IPC and SSE.
5. The renderer refreshes its plan list and opens newly live plans automatically.

### Comments

Annotations are stored as sibling JSON files beside the archived plan:

```text
plans/example-plan.comments.json
```

Each annotation records the selected quote, note text, type, timestamp, and optional browser-mode author name. Highlights are reapplied by finding the quoted text in the rendered Markdown.

Review decisions and plan memory are stored beside the archived plan:

```text
plans/example-plan.review.json
plans/example-plan.timeline.json
```

Review files store checklist state, final decisions, and annotation snapshots. Timeline files record created, revised, annotated, checklist-updated, approved, changes-requested, and dismissed events.

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
plans/*.review.json       # Per-plan review decisions and checklist state
plans/*.timeline.json     # Per-plan memory timeline
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

- Search does not yet index full plan body content.
- Comment anchoring is quote-based and can fail if plan text changes.
- Trigger/project extraction depends on Claude and Codex JSONL history shapes and can be fragile.
- The browser sharing server has no authentication.
- Some CSS is stale or needs accessibility polish, especially focus states.
- There is no dark mode.
