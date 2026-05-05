# shadcn Renderer Migration Plan

## Summary

Migrate the current vanilla renderer into a React + Tailwind + shadcn/ui renderer while preserving the Electron main process, preload bridge, local `design-docs/` storage, and existing design-doc APIs.

The goal is not to add shadcn as decoration. The goal is to replace the hand-built UI shell with accessible, consistent primitives so the app feels like a serious focused IDE for authoring `DESIGN.md` files.

## Product Target

The product remains a local-first `DESIGN.md` authoring workspace:

- Left rail: local document vault grouped by project.
- Center: markdown editor with line numbers, autosave, and status stats.
- Right: live preview with `Document`, `Tokens`, `Components`, and `Issues`.
- Cmd+K: document/action command palette.
- Export actions: copy `DESIGN.md`, token JSON, Tailwind config, path, and agent prompt.
- Theme support: dark and light.

## Architecture Direction

- Keep Electron `main.js` and `preload.js` APIs intact.
- Add a React renderer entrypoint under `renderer/src/`.
- Use Tailwind for app tokens and layout utilities.
- Use shadcn/ui components for shell controls and interaction primitives.
- Keep markdown parsing, front matter parsing, token resolution, and component playground logic as renderer modules that can be reused by React components.
- Keep Playwright as the verification harness.

## Proposed Stack

- React
- TypeScript if the migration cost stays reasonable; otherwise JavaScript with JSX for the first cut
- Tailwind CSS
- shadcn/ui
- Radix primitives through shadcn
- Existing `marked.min.js` can be replaced with package-based `marked` during the migration if useful

## shadcn Component Mapping

- App shell and left rail: custom layout using `ScrollArea`, `Button`, `Badge`, `Separator`, `Tooltip`
- Split editor/preview: `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`
- Preview modes: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- Toolbar: `Button`, `DropdownMenu`, `Tooltip`, `Toggle`
- Cmd+K: `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandGroup`, `CommandItem`
- New/rename/delete flows: `Dialog`, `AlertDialog`, `Input`, `Label`
- Export/status feedback: `Toast`/`Sonner` or shadcn toast
- Status indicators: `Badge`
- Component playground: mostly custom components styled with Tailwind tokens

## Migration Phases

### Phase 1: Build System And Skeleton

- Add React/Tailwind/shadcn dependencies.
- Add a renderer build step that outputs bundled assets consumed by Electron.
- Keep the old renderer available until the new shell can boot.
- Create a minimal React app that calls `window.planAPI.getDesignDocs()`.
- Confirm Electron and `/__desktop-test` can load the React renderer.

### Phase 2: State And Data Model

- Port renderer state into React:
  - active document
  - markdown content
  - dirty/saving/saved state
  - pane mode
  - preview tab
  - theme
  - command palette state
- Preserve existing autosave behavior.
- Preserve document create/read/save/rename/delete flows.

### Phase 3: Focused IDE Shell

- Rebuild the topbar with shadcn buttons/dropdowns/tooltips.
- Rebuild the left document rail with project groups and compact document rows.
- Rebuild editor/preview split panes with `ResizablePanelGroup`.
- Ensure narrow layout collapses predictably.

### Phase 4: Editor And Preview

- Port markdown editor surface:
  - line numbers
  - textarea/editor
  - status bar
  - sync scroll
- Port preview renderer:
  - Document tab
  - Tokens tab
  - Components playground
  - Issues tab
- Keep convention-based fallback rendering for prose-only docs.

### Phase 5: Command Palette And Actions

- Rebuild Cmd+K with shadcn `Command`.
- Include:
  - open document
  - create document
  - focus editor
  - focus preview
  - toggle theme
  - export actions
- Rebuild overflow menu actions.

### Phase 6: Visual QA And Hardening

- Update Playwright tests for the React UI.
- Add visual coverage for:
  - dark split workspace
  - light split workspace
  - components playground
  - preview-only mode
  - editor-only mode
  - command palette
  - new document dialog
  - narrow viewport
- Verify no horizontal overflow in preview.
- Verify collapsed rail does not collide with macOS controls.

## Risks

- The current renderer is large and stateful; a direct rewrite may accidentally drop small behaviors.
- shadcn does not provide a code editor, so the editor surface remains custom unless we adopt CodeMirror or Monaco.
- Tailwind/shadcn introduces build complexity that the app does not currently have.
- Visual parity should be judged through screenshots, not just tests.

## Decisions To Make Before Implementation

- Use TypeScript now or migrate with JSX first?
- Keep textarea editor or introduce CodeMirror?
- Replace `marked.min.js` with package-managed `marked`?
- Keep the current `renderer/index.html` as the shell or generate it through a bundler?

## Recommended Defaults

- Use React + TypeScript + Vite if it can coexist cleanly with Electron.
- Keep the current textarea editor for the first migration; evaluate CodeMirror after the shell is stable.
- Use package-managed `marked`.
- Keep Electron APIs unchanged.
- Keep the old renderer in git history only, not as a parallel UI after migration succeeds.

## Validation Checklist

- `npm start` launches the React renderer.
- `/__desktop-test` loads deterministic mock docs.
- Existing design docs open and save.
- Creating, renaming, deleting, and autosaving docs works.
- Live preview updates while typing.
- Tokens/components/issues render from YAML front matter.
- Cmd+K keyboard and mouse interactions work.
- Dark/light themes are readable.
- Narrow viewport is usable.
- Playwright UI tests pass.
