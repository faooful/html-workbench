import * as React from "react"
import { createRoot } from "react-dom/client"
import { ArrowUpRight, GitBranch, Sparkles } from "lucide-react"

import editorVideo from "./assets/html-render-editor.mp4"
import newFileVideo from "./assets/html-render-new-file.mp4"
import syncScrollVideo from "./assets/html-render-sync-scroll.mp4"
import "./website.css"

const features = [
  ["Local", "HTML files stay on your machine"],
  ["Instant render", "preview updates as you type"],
  ["Agent ready", "copy the file path and full brief"],
  ["HTML native", "no markdown translation layer"],
  ["Slash snippets", "plans, prototypes, tables and notes"],
]

function App() {
  return (
    <main className="site-shell">
      <section className="copy-panel">
        <header className="site-nav">
          <a className="brand-mark" href="/" aria-label="html-render home">
            <span>hr</span>
          </a>
          <nav aria-label="Primary navigation">
            <a className="github-link" href="https://github.com/faooful/html-workbench" target="_blank" rel="noreferrer">
              <GitBranch size={18} />
              GitHub
            </a>
          </nav>
        </header>

        <div className="hero-copy">
          <h1>Fast local app for rendering your workspace HTML files</h1>
          <p className="promise">Free and local-first. Your HTML stays with you.</p>
        </div>

        <div className="feature-list" aria-label="Product features">
          {features.map(([lead, detail]) => (
            <p key={lead}>
              <strong>{lead}</strong>
              <span>{detail}</span>
            </p>
          ))}
        </div>
      </section>

      <section className="screens-panel" aria-label="html-render product screenshots">
        <div className="screen-band first">
          <video className="product-media" src={editorVideo} autoPlay loop muted playsInline preload="auto" aria-label="html-render editor updating a live preview" />
        </div>
        <div className="screen-band second">
          <video className="product-media" src={syncScrollVideo} autoPlay loop muted playsInline preload="auto" aria-label="html-render editor and preview scrolling in sync" />
        </div>
        <div className="screen-band third">
          <video className="product-media" src={newFileVideo} autoPlay loop muted playsInline preload="auto" aria-label="html-render creating a new local HTML file" />
        </div>
      </section>

      <a className="updates-chip" id="updates" href="#download">
        <Sparkles size={15} />
        html-render desktop preview
        <ArrowUpRight size={15} />
      </a>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
