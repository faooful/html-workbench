# HTML Workbench

HTML Workbench is a local-first Electron app for editing and previewing HTML files side by side. It keeps an app-owned library of `.html` files, edits them in a built-in textarea, and previews the rendered document in an iframe.

## What It Does

- Lists saved `.html` files from the app library, sorted by most recently modified.
- Restores the last opened file, autosave settings, and theme preference.
- Provides a split HTML editor and render preview, with editor-only and preview-only pane modes.
- Updates the preview after edits and autosaves changes back to disk.
- Creates, renames, deletes, reveals, and opens HTML files through Electron IPC.
- Includes a command palette for file switching and common actions.

## Tech Stack

- Electron 41 for the desktop shell.
- Vanilla JavaScript renderer with no framework and no build step.
- Static CSS with Geist and Geist Mono variable fonts.

## Running

```sh
npm install
npm start
```

## Runtime State

These files are generated locally and ignored by Git:

```text
.ui-artifacts/            # Local screenshots or visual scratch output
test-results/
```
