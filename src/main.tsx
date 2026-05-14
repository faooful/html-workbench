import * as React from "react"
import { createRoot } from "react-dom/client"
import { Code2, Copy, ExternalLink, FileText, LayoutPanelTop, Menu, Moon, MoreHorizontal, Pencil, Plus, Save, Search, Sun, Trash2 } from "lucide-react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupHeading,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "./components/ui/command"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "./components/ui/sidebar"
import { cn } from "./lib/utils"
import "./styles.css"

type HtmlFile = {
  name: string
  path: string
  mtime: number
  size: number
  title?: string | null
}

type HtmlAPI = {
  listHtmlFiles: (dirPath?: string | null) => Promise<HtmlFile[]>
  readFile: (filePath: string) => Promise<string | null>
  writeFile: (filePath: string, content: string) => Promise<boolean>
  openInBrowser: (filePath: string) => Promise<unknown>
  revealInFinder: (filePath: string) => Promise<unknown>
  getWatchDir: () => Promise<string | null>
  setWatchDir: (dirPath: string) => Promise<boolean>
  chooseDirectory: () => Promise<string | null>
  createHtmlFile: (dirPath: string | null, title: string) => Promise<{ name: string; path: string } | null>
  deleteHtmlFile: (filePath: string) => Promise<boolean>
  renameHtmlFile: (oldPath: string, newName: string) => Promise<string | null>
}

declare global {
  interface Window {
    htmlAPI?: HtmlAPI
  }
}

const AUTOSAVE_DELAYS = [1000, 3000, 5000, 10000]
const PREF_KEY = "htmlWorkbenchPrefs"
const HTML_TAGS = ["a", "article", "aside", "b", "blockquote", "br", "button", "canvas", "code", "div", "em", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "img", "input", "label", "li", "main", "nav", "ol", "option", "p", "pre", "section", "select", "span", "strong", "table", "tbody", "td", "textarea", "th", "thead", "tr", "ul"]
const VOID_TAGS = new Set(["br", "hr", "img", "input"])
const TAG_COMPLETIONS: Record<string, { text: string; caretOffset: number }> = {
  a: { text: '<a href=""></a>', caretOffset: 9 },
  button: { text: '<button type="button"></button>', caretOffset: 22 },
  img: { text: '<img src="" alt="" />', caretOffset: 10 },
  input: { text: '<input type="text" />', caretOffset: 13 },
}
const PLAN_SNIPPET = `<article class="agent-plan">
  <h1>Plan Title</h1>

  <section>
    <h2>Goal</h2>
    <p>Describe the outcome this work should achieve.</p>
  </section>

  <section>
    <h2>Context</h2>
    <p>Capture the current state, constraints, and relevant background.</p>
  </section>

  <section>
    <h2>Requirements</h2>
    <ul>
      <li>Requirement one</li>
      <li>Requirement two</li>
    </ul>
  </section>

  <section data-prototype="true">
    <h2>Prototype</h2>
    <p>Replace this with a simple inline HTML prototype.</p>
  </section>

  <section>
    <h2>Implementation Notes</h2>
    <p>Call out important files, data flow, edge cases, or sequencing.</p>
  </section>

  <section>
    <h2>Acceptance Criteria</h2>
    <ul>
      <li>Expected behavior is verifiable.</li>
      <li>Relevant checks pass.</li>
    </ul>
  </section>

  <section>
    <h2>Open Questions</h2>
    <ul>
      <li>Question to resolve before implementation.</li>
    </ul>
  </section>
</article>`
const PROTOTYPE_SNIPPET = `<section data-prototype="true">
  <h2>Prototype</h2>
  <div class="prototype-surface">
    <h3>Prototype state</h3>
    <p>Describe or build the UI state the implementing agent should understand.</p>
    <button type="button">Primary action</button>
  </div>
</section>`
const SLASH_COMMANDS = [
  { key: "plan", label: "Agent plan scaffold", aliases: ["brief", "handoff", "spec"], snippet: PLAN_SNIPPET },
  { key: "prototype", label: "Prototype block", aliases: ["proto", "mockup"], snippet: PROTOTYPE_SNIPPET },
  { key: "requirements", label: "Requirements section", aliases: ["reqs"], snippet: "<section>\n  <h2>Requirements</h2>\n  <ul>\n    <li>Requirement one</li>\n  </ul>\n</section>" },
  { key: "acceptance", label: "Acceptance criteria", aliases: ["criteria", "done"], snippet: "<section>\n  <h2>Acceptance Criteria</h2>\n  <ul>\n    <li>Expected behavior is verifiable.</li>\n  </ul>\n</section>" },
  { key: "questions", label: "Open questions", aliases: ["open"], snippet: "<section>\n  <h2>Open Questions</h2>\n  <ul>\n    <li>Question to resolve.</li>\n  </ul>\n</section>" },
  { key: "notes", label: "Implementation notes", aliases: ["implementation"], snippet: "<section>\n  <h2>Implementation Notes</h2>\n  <p>Important implementation context.</p>\n</section>" },
  { key: "decision", label: "Decision record", aliases: ["adr", "choice"], snippet: "<section>\n  <h2>Decision</h2>\n  <p><strong>Decision:</strong> Chosen approach.</p>\n  <p><strong>Reason:</strong> Why this is the right tradeoff.</p>\n</section>" },
  { key: "todo", label: "Todo list", aliases: ["tasks", "checklist"], snippet: "<section>\n  <h2>Todo</h2>\n  <ul>\n    <li>Task one</li>\n  </ul>\n</section>" },
  { key: "h1", label: "Heading 1", aliases: ["heading", "title"], snippet: "<h1>Heading</h1>" },
  { key: "h2", label: "Heading 2", aliases: ["subheading"], snippet: "<h2>Heading</h2>" },
  { key: "p", label: "Paragraph", aliases: ["text"], snippet: "<p>Paragraph text</p>" },
  { key: "ul", label: "Bulleted list", aliases: ["list", "unordered"], snippet: "<ul>\n  <li>First item</li>\n  <li>Second item</li>\n</ul>" },
  { key: "ol", label: "Numbered list", aliases: ["ordered"], snippet: "<ol>\n  <li>First item</li>\n  <li>Second item</li>\n</ol>" },
  { key: "quote", label: "Quote", aliases: ["blockquote"], snippet: "<blockquote>\n  <p>Quote text</p>\n</blockquote>" },
  { key: "table", label: "Table", aliases: ["grid"], snippet: "<table>\n  <thead>\n    <tr><th>Column</th><th>Column</th></tr>\n  </thead>\n  <tbody>\n    <tr><td>Value</td><td>Value</td></tr>\n  </tbody>\n</table>" },
  { key: "image", label: "Image", aliases: ["img", "picture"], snippet: '<img src="" alt="" />' },
  { key: "button", label: "Button", aliases: ["cta"], snippet: '<button type="button">Button</button>' },
  { key: "card", label: "Card", aliases: ["panel"], snippet: '<section class="card">\n  <h2>Card title</h2>\n  <p>Card content</p>\n</section>' },
  { key: "section", label: "Section", aliases: ["block"], snippet: "<section>\n  <h2>Section title</h2>\n  <p>Section content</p>\n</section>" },
  { key: "canvas", label: "Canvas placeholder", aliases: ["drawing"], snippet: '<section class="canvas-block" data-prototype="true">\n  <h2>Canvas Prototype</h2>\n  <canvas width="640" height="360" aria-label="Canvas placeholder"></canvas>\n</section>' },
]

type SlashCommand = (typeof SLASH_COMMANDS)[number]
type PaletteGroup = "Files" | "Actions" | "View"
type PaletteItem = {
  id: string
  group: PaletteGroup
  label: string
  detail: string
  keywords: string[]
  shortcut?: string
  icon: React.ReactNode
  run: () => void | Promise<unknown>
}

const sampleFiles: HtmlFile[] = [
  { name: "checkout-spec.html", path: "/mock/checkout-spec.html", mtime: Date.now() - 5 * 60_000, size: 800, title: "checkout-spec" },
  { name: "api-latency-report.html", path: "/mock/api-latency-report.html", mtime: Date.now() - 2 * 60 * 60_000, size: 900, title: "api-latency-report" },
  { name: "onboarding-design.html", path: "/mock/onboarding-design.html", mtime: Date.now() - 24 * 60 * 60_000, size: 1000, title: "onboarding-design" },
]

const sampleContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Checkout Flow Spec</title>
  <style>
    body { font: 15px/1.6 system-ui; margin: 0; padding: 40px; max-width: 720px; color: #1a1a1a; }
    h1 { font-size: 26px; margin: 0 0 24px; }
    h2 { font-size: 18px; margin: 28px 0 12px; }
    p { margin: 10px 0; color: #444; }
  </style>
</head>
<body>
  <h1>Checkout Flow Spec</h1>
  <h2>Overview</h2>
  <p>This document describes the checkout flow for the v2 redesign.</p>
  <h2>States</h2>
  <p>Cart → Address → Payment → Confirmation</p>
</body>
</html>`

function ensureApi(): HtmlAPI {
  if (window.htmlAPI) return window.htmlAPI
  let files = [...sampleFiles]
  const contents = new Map(files.map(file => [file.path, sampleContent]))
  return {
    async listHtmlFiles() {
      return files
    },
    async readFile(filePath) {
      return contents.get(filePath) || sampleContent
    },
    async writeFile(filePath, content) {
      contents.set(filePath, content)
      files = files.map(file => file.path === filePath ? { ...file, mtime: Date.now() } : file)
      return true
    },
    async openInBrowser() {
      return true
    },
    async revealInFinder() {
      return true
    },
    async getWatchDir() {
      return "/mock"
    },
    async setWatchDir() {
      return true
    },
    async chooseDirectory() {
      return "/mock"
    },
    async createHtmlFile(_dirPath, title) {
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled"
      const file = { name: `${slug}.html`, path: `/mock/${slug}.html`, mtime: Date.now(), size: 0, title }
      files = [file, ...files]
      contents.set(file.path, `<!DOCTYPE html><html><head><title>${title}</title></head><body><h1>${title}</h1></body></html>`)
      return file
    },
    async deleteHtmlFile(filePath) {
      files = files.filter(file => file.path !== filePath)
      return true
    },
    async renameHtmlFile(oldPath, newName) {
      const nextPath = oldPath.replace(/[^/]+$/, newName.endsWith(".html") ? newName : `${newName}.html`)
      files = files.map(file => file.path === oldPath ? { ...file, path: nextPath, name: nextPath.split("/").pop() || newName } : file)
      contents.set(nextPath, contents.get(oldPath) || "")
      contents.delete(oldPath)
      return nextPath
    },
  }
}

function getPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || "{}")
  } catch {
    return {}
  }
}

function setPrefs(next: Record<string, unknown>) {
  localStorage.setItem(PREF_KEY, JSON.stringify({ ...getPrefs(), ...next }))
}

function relativeTime(ms: number) {
  const d = Date.now() - ms
  if (d < 60_000) return "now"
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

function inferTitle(content: string) {
  const title = content.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
  const heading = content.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1]
  const firstLine = content.split("\n").find(line => line.trim())
  return (title || heading || firstLine || "Untitled").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 64)
}

function previewStyle(theme: string) {
  const dark = theme === "dark"
  const bg = dark ? "#151515" : "#f7f7f4"
  const fg = dark ? "#f4f4f2" : "#1f1f1d"
  const heading = dark ? "#ffffff" : "#181816"
  const border = dark ? "#2e2e2c" : "#deded8"
  return `<style data-html-workbench-preview>
html,body{background:${bg};color:${fg};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{margin:0}h1,h2,h3,h4,h5,h6{color:${heading};font-weight:750}p,li,td,th{color:${fg}}
table{border-collapse:collapse}th,td{border:1px solid ${border};padding:8px 10px}
[data-prototype]{margin:24px 0;padding:18px;border:1px solid ${border};border-radius:10px;background:${dark ? "#1c1c1a" : "#fff"}}
.prototype-surface{padding:18px;border:1px solid ${border};border-left:3px solid #ff6d3a;border-radius:8px;background:${dark ? "#20201e" : "#f1f1ec"}}
</style>`
}

function buildPreviewSrcdoc(content: string, theme: string) {
  const style = previewStyle(theme)
  if (/<html[\s>]/i.test(content)) {
    if (/<\/head>/i.test(content)) return content.replace(/<\/head>/i, `${style}</head>`)
    if (/<head[\s>]/i.test(content)) return content.replace(/<head([^>]*)>/i, `<head$1>${style}`)
    return content.replace(/<html([^>]*)>/i, `<html$1><head>${style}</head>`)
  }
  return `<!DOCTYPE html><html><head>${style}</head><body>${content}</body></html>`
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function paletteItemMatches(item: PaletteItem, query: string) {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const haystack = normalizeSearch([item.group, item.label, item.detail, ...item.keywords].join(" "))
  return terms.every(term => haystack.includes(term))
}

function App() {
  const api = React.useMemo(() => ensureApi(), [])
  const prefs = React.useMemo(() => getPrefs(), [])
  const [theme, setThemeState] = React.useState<string>(prefs.theme || "dark")
  const [paneMode, setPaneMode] = React.useState<"split" | "editor" | "preview">("split")
  const [railHidden, setRailHidden] = React.useState(false)
  const [files, setFiles] = React.useState<HtmlFile[]>([])
  const [watchDir, setWatchDir] = React.useState<string | null>(null)
  const [activePath, setActivePath] = React.useState<string | null>(prefs.lastFilePath || null)
  const [content, setContent] = React.useState("")
  const [dirty, setDirty] = React.useState(false)
  const [saveLabel, setSaveLabel] = React.useState("Ready")
  const [autosave, setAutosave] = React.useState(prefs.autosaveEnabled !== false)
  const [autosaveDelay, setAutosaveDelay] = React.useState<number>(prefs.autosaveDelayMs || 1000)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [paletteQuery, setPaletteQuery] = React.useState("")
  const [paletteIndex, setPaletteIndex] = React.useState(0)
  const [newOpen, setNewOpen] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState("")
  const [toast, setToast] = React.useState("")
  const [slash, setSlash] = React.useState<{ open: boolean; start: number; index: number; items: SlashCommand[] }>({ open: false, start: -1, index: 0, items: [] })
  const slashRef = React.useRef(slash)
  const editorRef = React.useRef<HTMLTextAreaElement | null>(null)
  const lineRef = React.useRef<HTMLPreElement | null>(null)
  const saveTimer = React.useRef<number | null>(null)
  const paletteItemRefs = React.useRef(new Map<string, HTMLButtonElement>())

  const activeFile = files.find(file => file.path === activePath)
  const activeTitle = activeFile?.title || activeFile?.name?.replace(/\.html$/, "") || inferTitle(content) || "Untitled"
  const lineCount = Math.max(1, content.split("\n").length)
  const lineNumbers = Array.from({ length: lineCount }, (_, index) => index + 1).join("\n")

  React.useEffect(() => {
    slashRef.current = slash
  }, [slash])

  React.useEffect(() => {
    if (!paletteOpen) return
    setPaletteQuery("")
    setPaletteIndex(0)
  }, [paletteOpen])

  const showToast = React.useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(""), 1800)
  }, [])

  const setTheme = React.useCallback((next: string) => {
    setThemeState(next)
    setPrefs({ theme: next })
  }, [])

  const refreshFiles = React.useCallback(async (dir = watchDir) => {
    if (!dir) return []
    const next = await api.listHtmlFiles(dir)
    setFiles(next)
    return next
  }, [api, watchDir])

  const openFile = React.useCallback(async (filePath: string) => {
    const next = await api.readFile(filePath)
    if (next == null) return showToast("Could not open file")
    setActivePath(filePath)
    setContent(next)
    setDirty(false)
    setSaveLabel("Saved")
    setPrefs({ lastFilePath: filePath })
  }, [api, showToast])

  const saveNow = React.useCallback(async () => {
    if (!activePath) return false
    setSaveLabel("Saving...")
    const ok = await api.writeFile(activePath, content)
    if (!ok) {
      setSaveLabel("Save failed")
      return false
    }
    setDirty(false)
    setSaveLabel("Saved")
    await refreshFiles()
    return true
  }, [activePath, api, content, refreshFiles])

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  React.useEffect(() => {
    let live = true
    async function init() {
      const dir = await api.getWatchDir()
      if (!live) return
      setWatchDir(dir)
      const listed = dir ? await api.listHtmlFiles(dir) : []
      if (!live) return
      setFiles(listed)
      const preferred = listed.find(file => file.path === activePath)?.path || listed[0]?.path
      if (preferred) await openFile(preferred)
      else setSaveLabel("Ready")
    }
    init()
    return () => { live = false }
  }, [])

  React.useEffect(() => {
    if (!dirty || !autosave) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { void saveNow() }, autosaveDelay)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [autosave, autosaveDelay, dirty, saveNow])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const currentSlash = slashRef.current
      if (currentSlash.open && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) {
        event.preventDefault()
        if (event.key === "ArrowDown") {
          const next = { ...currentSlash, index: Math.min(currentSlash.index + 1, currentSlash.items.length - 1) }
          slashRef.current = next
          setSlash(next)
        } else if (event.key === "ArrowUp") {
          const next = { ...currentSlash, index: Math.max(currentSlash.index - 1, 0) }
          slashRef.current = next
          setSlash(next)
        } else if (event.key === "Enter" || event.key === "Tab") {
          applySlashCommand(currentSlash.index)
        } else {
          setSlash({ open: false, start: -1, index: 0, items: [] })
        }
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen(true)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        void saveNow().then(ok => ok && showToast("Saved"))
      }
      if (event.key === "Escape") {
        setPaletteOpen(false)
        setMenuOpen(false)
        setNewOpen(false)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [saveNow, showToast])

  function updateContent(next: string) {
    setContent(next)
    setDirty(true)
    setSaveLabel("Unsaved")
    window.setTimeout(updateSlashMenu, 0)
  }

  function commandMatches(command: SlashCommand, query: string) {
    if (!query) return true
    return [command.key, command.label, ...command.aliases].some(value => value.toLowerCase().includes(query))
  }

  function slashTriggerAtCaret() {
    const editor = editorRef.current
    if (!editor) return null
    const caret = editor.selectionStart
    const text = editor.value.slice(0, caret)
    const match = text.match(/(^|[\s>])\/([a-z0-9-]*)$/i)
    if (!match) return null
    return { start: caret - match[2].length - 1, query: match[2].toLowerCase() }
  }

  function updateSlashMenu() {
    const trigger = slashTriggerAtCaret()
    if (!trigger) {
      setSlash({ open: false, start: -1, index: 0, items: [] })
      return
    }
    const items = SLASH_COMMANDS.filter(command => commandMatches(command, trigger.query))
    setSlash({ open: items.length > 0, start: trigger.start, index: 0, items })
  }

  function replaceEditorRange(start: number, end: number, replacement: string, selectionStart?: number, selectionEnd?: number) {
    const editor = editorRef.current
    const next = `${content.slice(0, start)}${replacement}${content.slice(end)}`
    const caretStart = selectionStart ?? start + replacement.length
    const caretEnd = selectionEnd ?? caretStart
    setContent(next)
    setDirty(true)
    setSaveLabel("Unsaved")
    window.setTimeout(() => {
      editor?.focus()
      editor?.setSelectionRange(caretStart, caretEnd)
    }, 0)
  }

  function applySlashCommand(index = slash.index) {
    const editor = editorRef.current
    const current = slashRef.current
    const command = current.items[index]
    if (!editor || !command || current.start < 0) return false
    replaceEditorRange(current.start, editor.selectionStart, command.snippet)
    setSlash({ open: false, start: -1, index: 0, items: [] })
    return true
  }

  function completePartialTag() {
    const editor = editorRef.current
    if (!editor || editor.selectionStart !== editor.selectionEnd) return false
    const caret = editor.selectionStart
    const before = content.slice(0, caret)
    const match = before.match(/<([a-z0-9-]*)$/i)
    if (!match) return false
    const partial = match[1].toLowerCase()
    if (!partial) return false
    const tag = HTML_TAGS.find(item => item.startsWith(partial))
    if (!tag) return false
    const start = caret - partial.length
    const completion = TAG_COMPLETIONS[tag]
    const replacement = completion?.text.slice(1) || (VOID_TAGS.has(tag) ? `${tag} />` : `${tag}></${tag}>`)
    const selection = start + (completion ? completion.caretOffset - 1 : tag.length + 1)
    replaceEditorRange(start, caret, replacement, selection, selection)
    return true
  }

  function completeBareTag() {
    const editor = editorRef.current
    if (!editor || editor.selectionStart !== editor.selectionEnd) return false
    const caret = editor.selectionStart
    const before = content.slice(0, caret)
    const match = before.match(/(^|[\s>])([a-z][a-z0-9-]*)$/i)
    if (!match) return false
    const token = match[2].toLowerCase()
    const tag = HTML_TAGS.find(item => item === token) || HTML_TAGS.find(item => item.startsWith(token))
    if (!tag) return false
    const start = caret - token.length
    const completion = TAG_COMPLETIONS[tag]
    const replacement = completion?.text || (VOID_TAGS.has(tag) ? `<${tag} />` : `<${tag}></${tag}>`)
    const selection = start + (completion?.caretOffset ?? (VOID_TAGS.has(tag) ? replacement.length : tag.length + 2))
    replaceEditorRange(start, caret, replacement, selection, selection)
    return true
  }

  function insertTabSpaces() {
    const editor = editorRef.current
    if (!editor) return
    replaceEditorRange(editor.selectionStart, editor.selectionEnd, "  ")
  }

  function handleEditorKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const currentSlash = slashRef.current
    if (currentSlash.open && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === "ArrowDown") {
        const next = { ...currentSlash, index: Math.min(currentSlash.index + 1, currentSlash.items.length - 1) }
        slashRef.current = next
        setSlash(next)
      } else if (event.key === "ArrowUp") {
        const next = { ...currentSlash, index: Math.max(currentSlash.index - 1, 0) }
        slashRef.current = next
        setSlash(next)
      } else if (event.key === "Enter" || event.key === "Tab") applySlashCommand(currentSlash.index)
      else setSlash({ open: false, start: -1, index: 0, items: [] })
      return
    }
    if (event.key === "Tab") {
      event.preventDefault()
      if (!completePartialTag() && !completeBareTag()) insertTabSpaces()
    }
  }

  async function createFile(event: React.FormEvent) {
    event.preventDefault()
    const title = newTitle.trim() || "Untitled"
    const result = await api.createHtmlFile(watchDir, title)
    if (!result) return showToast("Could not create file")
    setNewOpen(false)
    setNewTitle("")
    const listed = await refreshFiles()
    setFiles(listed)
    await openFile(result.path)
    showToast(`Created ${result.name}`)
  }

  async function renameFile(path = activePath) {
    if (!path) return
    const current = files.find(file => file.path === path)?.name?.replace(/\.html$/, "") || "Untitled"
    const next = window.prompt("Rename file", current)
    if (!next?.trim()) return
    const renamed = await api.renameHtmlFile(path, next.trim())
    if (!renamed) return showToast("Could not rename file")
    await refreshFiles()
    if (path === activePath) setActivePath(renamed)
  }

  async function deleteFile() {
    if (!activePath) return
    if (!window.confirm("Delete this HTML file?")) return
    const ok = await api.deleteHtmlFile(activePath)
    if (!ok) return showToast("Could not delete file")
    const listed = await refreshFiles()
    const next = listed[0]
    if (next) await openFile(next.path)
    else {
      setActivePath(null)
      setContent("")
    }
  }

  async function copyBrief() {
    const brief = `Use the HTML file at ${activePath || "an unsaved document"} as the source of truth.\n\n${content}`
    await navigator.clipboard.writeText(brief)
    showToast("Copied agent brief")
  }

  async function copyPath() {
    if (!activePath) return
    await navigator.clipboard.writeText(activePath)
    showToast("Copied path")
  }

  function cycleDelay() {
    const index = AUTOSAVE_DELAYS.indexOf(autosaveDelay)
    const next = AUTOSAVE_DELAYS[(index + 1) % AUTOSAVE_DELAYS.length]
    setAutosaveDelay(next)
    setPrefs({ autosaveDelayMs: next })
  }

  const paletteItems: PaletteItem[] = [
    ...files.map(file => {
      const title = file.title || file.name.replace(/\.html$/, "")
      return {
        id: `file:${file.path}`,
        group: "Files" as const,
        label: title,
        detail: `${file.name} · ${relativeTime(file.mtime)}`,
        keywords: [file.name, file.path, title, "open document html"],
        icon: <FileText size={15} />,
        run: () => openFile(file.path),
      }
    }),
    {
      id: "action:new",
      group: "Actions",
      label: "New HTML file",
      detail: "Create a document in the app library",
      keywords: ["create file document html new plus"],
      shortcut: "⌘N",
      icon: <Plus size={15} />,
      run: () => setNewOpen(true),
    },
    {
      id: "action:save",
      group: "Actions",
      label: "Save current file",
      detail: dirty ? "Write unsaved changes to disk" : "Current file is already saved",
      keywords: ["save write disk persist"],
      shortcut: "⌘S",
      icon: <Save size={15} />,
      run: () => saveNow().then(ok => ok && showToast("Saved")),
    },
    {
      id: "action:theme",
      group: "Actions",
      label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      detail: "Toggle the workbench color theme",
      keywords: ["theme appearance light dark"],
      icon: theme === "dark" ? <Sun size={15} /> : <Moon size={15} />,
      run: () => setTheme(theme === "dark" ? "light" : "dark"),
    },
    {
      id: "action:autosave",
      group: "Actions",
      label: autosave ? "Turn autosave off" : "Turn autosave on",
      detail: autosave ? "Manual saves only" : `Save after ${Math.round(autosaveDelay / 1000)} seconds`,
      keywords: ["autosave automatic save preference"],
      icon: <Save size={15} />,
      run: () => {
        setAutosave(!autosave)
        setPrefs({ autosaveEnabled: !autosave })
      },
    },
    {
      id: "action:autosave-delay",
      group: "Actions",
      label: "Cycle autosave delay",
      detail: `Currently ${Math.round(autosaveDelay / 1000)} seconds`,
      keywords: ["autosave delay interval seconds timing"],
      icon: <Save size={15} />,
      run: cycleDelay,
    },
    ...(activePath ? [
      {
        id: "action:rename",
        group: "Actions" as const,
        label: "Rename current file",
        detail: activeFile?.name || "Current HTML file",
        keywords: ["rename title file document"],
        icon: <Pencil size={15} />,
        run: () => renameFile(),
      },
      {
        id: "action:copy-path",
        group: "Actions" as const,
        label: "Copy file path",
        detail: activePath,
        keywords: ["copy path location clipboard"],
        icon: <Copy size={15} />,
        run: copyPath,
      },
      {
        id: "action:copy-brief",
        group: "Actions" as const,
        label: "Copy agent brief",
        detail: "Copy path plus full HTML content",
        keywords: ["copy agent brief prompt clipboard source"],
        icon: <Copy size={15} />,
        run: copyBrief,
      },
      {
        id: "action:browser",
        group: "Actions" as const,
        label: "Open in browser",
        detail: "Open the rendered HTML file externally",
        keywords: ["open browser external render"],
        icon: <ExternalLink size={15} />,
        run: () => api.openInBrowser(activePath),
      },
      {
        id: "action:finder",
        group: "Actions" as const,
        label: "Reveal in Finder",
        detail: "Show the file in its folder",
        keywords: ["reveal finder folder show"],
        icon: <ExternalLink size={15} />,
        run: () => api.revealInFinder(activePath),
      },
      {
        id: "action:delete",
        group: "Actions" as const,
        label: "Delete current file",
        detail: activeFile?.name || "Current HTML file",
        keywords: ["delete remove trash file document"],
        icon: <Trash2 size={15} />,
        run: deleteFile,
      },
    ] : []),
    {
      id: "view:split",
      group: "View",
      label: "Show editor and preview",
      detail: "Use split pane mode",
      keywords: ["view split both editor preview panes"],
      icon: <LayoutPanelTop size={15} />,
      run: () => setPaneMode("split"),
    },
    {
      id: "view:editor",
      group: "View",
      label: "Focus editor",
      detail: "Hide the preview pane",
      keywords: ["view editor html code source"],
      icon: <Code2 size={15} />,
      run: () => setPaneMode("editor"),
    },
    {
      id: "view:preview",
      group: "View",
      label: "Focus preview",
      detail: "Hide the editor pane",
      keywords: ["view preview render iframe"],
      icon: <LayoutPanelTop size={15} />,
      run: () => setPaneMode("preview"),
    },
    {
      id: "view:sidebar",
      group: "View",
      label: railHidden ? "Show sidebar" : "Hide sidebar",
      detail: "Toggle the file library rail",
      keywords: ["sidebar rail files navigation hide show"],
      icon: <Menu size={15} />,
      run: () => setRailHidden(value => !value),
    },
  ]
  const filteredPaletteItems = paletteItems.filter(item => paletteItemMatches(item, paletteQuery))
  const paletteGroups: PaletteGroup[] = ["Files", "Actions", "View"]
  const groupedPaletteItems = paletteGroups
    .map(group => ({ group, items: filteredPaletteItems.filter(item => item.group === group) }))
    .filter(group => group.items.length > 0)

  React.useEffect(() => {
    setPaletteIndex(0)
  }, [paletteQuery, paletteOpen])

  React.useEffect(() => {
    if (paletteIndex <= filteredPaletteItems.length - 1) return
    setPaletteIndex(Math.max(0, filteredPaletteItems.length - 1))
  }, [filteredPaletteItems.length, paletteIndex])

  React.useEffect(() => {
    if (!paletteOpen) return
    const activeItem = filteredPaletteItems[paletteIndex]
    if (!activeItem) return
    paletteItemRefs.current.get(activeItem.id)?.scrollIntoView({ block: "nearest" })
  }, [filteredPaletteItems, paletteIndex, paletteOpen])

  function runPaletteItem(item: PaletteItem) {
    setPaletteOpen(false)
    setPaletteQuery("")
    void item.run()
  }

  function handlePaletteKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      setPaletteOpen(false)
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setPaletteIndex(index => Math.min(index + 1, Math.max(0, filteredPaletteItems.length - 1)))
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setPaletteIndex(index => Math.max(index - 1, 0))
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const item = filteredPaletteItems[paletteIndex]
      if (item) runPaletteItem(item)
    }
  }

  return (
    <div className={cn("app-shell", railHidden && "rail-hidden")} data-theme={theme} data-pane-mode={paneMode}>
      <Sidebar>
        <SidebarHeader>
          <div className="grid grid-cols-[minmax(0,1fr)_2.125rem] gap-2">
            <button className="flex h-9 w-full items-center gap-2 rounded-lg border border-sidebar-border px-3 text-left text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" type="button" onClick={() => setPaletteOpen(true)}>
              <Search size={15} />
              <span className="min-w-0 flex-1 truncate">Search files, actions...</span>
              <kbd className="rounded border border-sidebar-border bg-sidebar-accent px-1.5 py-0.5 text-[10px]">⌘K</kbd>
            </button>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-sidebar-border text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>
              <span>Files</span>
              <button className="rounded-md p-1 hover:bg-sidebar-accent" type="button" onClick={() => setNewOpen(true)} aria-label="Create HTML file">
                <Plus size={15} />
              </button>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {files.length ? files.map(file => {
                  const active = file.path === activePath
                  return (
                    <SidebarMenuItem key={file.path} className="group/menu-item">
                      <SidebarMenuButton isActive={active} onClick={() => openFile(file.path)}>
                        <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                          <strong className="truncate text-sm">{file.title || file.name.replace(/\.html$/, "")}</strong>
                          <em className="text-[11px] not-italic text-sidebar-foreground/45">{relativeTime(file.mtime)}</em>
                        </span>
                      </SidebarMenuButton>
                      <SidebarMenuAction onClick={() => renameFile(file.path)} aria-label={`Rename ${file.name}`}>
                        <Pencil size={13} />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  )
                }) : <li className="px-2 py-1 text-sm text-sidebar-foreground/50">No HTML files here yet.</li>}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>

      <main className="workspace">
        <header className="topbar">
          <div className="doc-title-wrap">
            <button className="icon-button" type="button" onClick={() => setRailHidden(value => !value)} aria-label="Toggle sidebar"><Menu size={16} /></button>
            <h2 className="active-title">{activeTitle}</h2>
            <button className="icon-button" type="button" onClick={() => renameFile()} aria-label="Rename file"><Pencil size={14} /></button>
          </div>
          <div className="topbar-actions">
            <button className="control-button" type="button" onClick={() => saveNow().then(ok => ok && showToast("Saved"))}>Save</button>
            <button className="icon-button" type="button" onClick={() => setMenuOpen(value => !value)} aria-label="More actions"><MoreHorizontal size={16} /></button>
            {menuOpen && (
              <div className="popover">
                <button type="button" onClick={() => { setMenuOpen(false); void copyPath() }}>Copy path</button>
                <button type="button" onClick={() => { setMenuOpen(false); void copyBrief() }}>Copy agent brief</button>
                <button type="button" onClick={() => { setMenuOpen(false); activePath && void api.openInBrowser(activePath) }}>Open in browser</button>
                <button type="button" onClick={() => { setMenuOpen(false); activePath && void api.revealInFinder(activePath) }}>Reveal in Finder</button>
                <hr />
                <button type="button" onClick={() => { setMenuOpen(false); void renameFile() }}>Rename file</button>
                <button type="button" onClick={() => { setMenuOpen(false); void deleteFile() }}>Delete file</button>
              </div>
            )}
          </div>
        </header>

        <div className="pane-toolbar">
          <div className="pane-title editor-title"><span>HTML</span><button className="icon-button" type="button" onClick={() => setPaneMode(paneMode === "editor" ? "split" : "editor")}>↗</button></div>
          <div className="pane-title preview-title"><span>Preview</span><button className="icon-button" type="button" onClick={() => setPaneMode(paneMode === "preview" ? "split" : "preview")}>↗</button></div>
        </div>

        <div className="splitter">
          <section className="editor-pane">
            <div className="editor-shell">
              <pre ref={lineRef} className="line-numbers" aria-hidden="true">{lineNumbers}</pre>
              <textarea
                ref={editorRef}
                className="html-editor"
                spellCheck={false}
                autoComplete="off"
                wrap="soft"
                value={content}
                onChange={event => updateContent(event.target.value)}
                onKeyDown={handleEditorKeyDown}
                onClick={() => window.setTimeout(updateSlashMenu, 0)}
                onKeyUp={() => window.setTimeout(updateSlashMenu, 0)}
                onScroll={event => { if (lineRef.current) lineRef.current.scrollTop = event.currentTarget.scrollTop }}
                aria-label="HTML editor"
                placeholder="Paste or write HTML here..."
              />
            </div>
            {slash.open && (
              <div className="slash-menu" role="listbox" aria-label="Slash commands">
                <ul>
                  {slash.items.map((item, index) => (
                    <li
                      key={item.key}
                      className={cn("slash-item", index === slash.index && "active")}
                      role="option"
                      aria-selected={index === slash.index}
                      onMouseEnter={() => setSlash(current => ({ ...current, index }))}
                      onMouseDown={event => {
                        event.preventDefault()
                        applySlashCommand(index)
                      }}
                    >
                      <strong>/{item.key}</strong>
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          <section className="preview-pane">
            <iframe className="preview-frame" title="HTML render" srcDoc={buildPreviewSrcdoc(content, theme)} />
          </section>
        </div>

        <footer className="statusbar">
          <div className="status-left">
            <span>{dirty ? "Unsaved" : saveLabel}</span>
            <span>Lines: {lineCount}</span>
            <span>{watchDir ? "App Library" : "Library unavailable"}</span>
          </div>
          <div className="status-actions">
            <label className="autosave-toggle">
              <input type="checkbox" checked={autosave} onChange={event => { setAutosave(event.target.checked); setPrefs({ autosaveEnabled: event.target.checked }) }} />
              <span>Autosave</span>
            </label>
            <button className="control-button" type="button" onClick={cycleDelay}>{Math.round(autosaveDelay / 1000)}s</button>
          </div>
        </footer>
      </main>

      {paletteOpen && (
        <div className="palette-layer">
          <div className="backdrop" onClick={() => setPaletteOpen(false)} />
          <div className="palette-card">
            <Command>
              <CommandInput
                autoFocus
                value={paletteQuery}
                onChange={event => setPaletteQuery(event.target.value)}
                onKeyDown={handlePaletteKeyDown}
                placeholder="Search files, actions, view modes..."
                aria-label="Command menu search"
              />
              <CommandList>
                {filteredPaletteItems.length ? groupedPaletteItems.map(group => (
                  <CommandGroup key={group.group}>
                    <CommandGroupHeading>{group.group}</CommandGroupHeading>
                    {group.items.map(item => {
                      const active = filteredPaletteItems[paletteIndex]?.id === item.id
                      return (
                        <CommandItem
                          key={item.id}
                          ref={node => {
                            if (node) paletteItemRefs.current.set(item.id, node)
                            else paletteItemRefs.current.delete(item.id)
                          }}
                          active={active}
                          onMouseEnter={() => setPaletteIndex(filteredPaletteItems.findIndex(match => match.id === item.id))}
                          onClick={() => runPaletteItem(item)}
                        >
                          <span className="command-icon">{item.icon}</span>
                          <span className="command-copy">
                            <strong>{item.label}</strong>
                            <em>{item.detail}</em>
                          </span>
                          {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                )) : (
                  <CommandEmpty>No files or commands match "{paletteQuery}".</CommandEmpty>
                )}
              </CommandList>
            </Command>
          </div>
        </div>
      )}

      {newOpen && (
        <div className="modal-layer">
          <div className="backdrop" onClick={() => setNewOpen(false)} />
          <form className="modal-card" onSubmit={createFile}>
            <div>
              <p className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">New file</p>
              <h2 className="m-0 mt-1 text-xl font-bold">Create HTML file</h2>
            </div>
            <label className="grid gap-2 text-sm text-[var(--text-secondary)]">
              <span>Title</span>
              <input value={newTitle} onChange={event => setNewTitle(event.target.value)} placeholder="My Report" required />
            </label>
            <div className="flex justify-end gap-2">
              <button className="control-button" type="button" onClick={() => setNewOpen(false)}>Cancel</button>
              <button className="control-button" type="submit">Create file</button>
            </div>
          </form>
        </div>
      )}

      <div className={cn("toast", toast && "visible")}>{toast}</div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
