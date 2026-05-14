# HTML Workbench

HTML Workbench is a local-first Electron app for editing and previewing HTML files side by side. It keeps a simple repo-local `html-files/` library, edits files in a built-in textarea, and previews the rendered document in an iframe.

## What It Does

- Lists saved `.html` files from `html-files/`, sorted by most recently modified.
- Restores the last opened file, autosave settings, and theme preference.
- Provides a split HTML editor and render preview, with editor-only and preview-only pane modes.
- Updates the preview after edits and autosaves changes back to disk.
- Creates, renames, deletes, reveals, and opens HTML files through Electron IPC.
- Includes a shadcn-style sidebar, command palette, slash snippets, and HTML tag completion.

## Tech Stack

- Electron 41 for the desktop shell.
- React 19 + Vite for the renderer.
- Tailwind CSS 4 with local shadcn-style sidebar primitives.
- Geist and Geist Mono variable fonts.

## Running

```sh
npm install
npm start
```

`npm start` builds the React renderer into `dist/renderer/` and launches Electron.

## Runtime State

These files are generated locally and ignored by Git:

```text
html-files/*.html         # Local HTML documents edited by the app
dist/                     # Built renderer output
```

The `html-files/` directory is kept in Git with `.gitkeep` so the app has one obvious library location.
