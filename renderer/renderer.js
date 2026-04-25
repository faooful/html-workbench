// ── State ─────────────────────────────────────────────────────────────────────

let allPlans        = []
let activePlan      = null
let activeContent   = ''
let activeTrigger   = null
let triggerExpanded = false
let snapshots       = []   // array of epoch-ms timestamps, oldest first
let activeSnapshot  = null // null = current; number = viewing that snapshot
let comments        = []
let pendingQuote    = ''
let paletteIndex    = 0
let isDiffMode      = false
let stepSections    = []
let stepIndex       = 0
let isStepMode      = false

// Per-group expanded counts: repoKey → number shown (multiples of PAGE_SIZE)
const PAGE_SIZE   = 5
const groupCounts = {}

// Collapsed groups: repoKey → bool
const collapsedGroups = {}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const planList            = document.getElementById('plan-list')
const searchInput         = document.getElementById('search')
const emptyState          = document.getElementById('empty-state')
const planHeader          = document.getElementById('plan-header')
const docTitle            = document.getElementById('doc-title')
const docDate             = document.getElementById('doc-date')
const liveBadge           = document.getElementById('live-badge')
const copyBtn             = document.getElementById('copy-btn')
const copyMenu            = document.getElementById('copy-menu')
const copyMarkdownBtn     = document.getElementById('copy-markdown-btn')
const copyTextBtn         = document.getElementById('copy-text-btn')
const copyWithCommentsBtn = document.getElementById('copy-with-comments-btn')
const sendBtn             = document.getElementById('send-btn')
const versionBanner       = document.getElementById('version-banner')
const liveBar             = document.getElementById('live-bar')
const liveDismissBtn      = document.getElementById('live-dismiss-btn')
const viewer              = document.getElementById('viewer')
const docContent          = document.getElementById('doc-content')
const commentAddBtn       = document.getElementById('comment-add-btn')
const commentBubble       = document.getElementById('comment-bubble')
const commentInput        = document.getElementById('comment-input')
const commentCancelBtn    = document.getElementById('comment-cancel-btn')
const commentSaveBtn      = document.getElementById('comment-save-btn')
const commentTooltip      = document.getElementById('comment-tooltip')
const tooltipNote         = document.getElementById('tooltip-note')
const tooltipDelete       = document.getElementById('tooltip-delete')
const toastEl             = document.getElementById('toast')
const tocPanel            = document.getElementById('toc-panel')
const tocList             = document.getElementById('toc-list')
const palette             = document.getElementById('palette')
const paletteInput        = document.getElementById('palette-input')
const paletteList         = document.getElementById('palette-list')
const paletteBackdrop     = document.getElementById('palette-backdrop')
const diffBtn             = document.getElementById('diff-btn')
const diffPanel           = document.getElementById('diff-panel')
const viewSwitcher        = document.getElementById('view-switcher')
const switcherFull        = document.getElementById('switcher-full')
const switcherStep        = document.getElementById('switcher-step')
const stepPanel           = document.getElementById('step-panel')
const stepNav             = document.getElementById('step-nav')
const stepBody            = document.getElementById('step-body')
const stepContent         = document.getElementById('step-content')
const stepMeta            = document.getElementById('step-meta')
const stepPrevBtn         = document.getElementById('step-prev-btn')
const stepNextBtn         = document.getElementById('step-next-btn')

marked.setOptions({ gfm: true, breaks: false })

// ── Web mode init ─────────────────────────────────────────────────────────────

if (window.WEB_MODE) {
  // Hide Electron-only controls
  document.getElementById('send-btn')?.classList.add('hidden')
  document.getElementById('live-dismiss-btn')?.classList.add('hidden')
} else {
  // Show sharing URL in sidebar footer
  window.planAPI.getSharingInfo?.().then(info => {
    if (!info?.url) return
    document.getElementById('share-url-text').textContent = info.url
    document.getElementById('share-widget').classList.remove('hidden')
  })
  document.getElementById('share-copy-btn')?.addEventListener('click', () => {
    window.planAPI.getSharingInfo?.().then(info => {
      if (info?.url) navigator.clipboard.writeText(info.url).catch(() => {})
      showToast('Link copied')
    })
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function formatRelativeDate(iso) {
  const d = new Date(iso), now = new Date()
  const diff = now - d
  const mins  = Math.floor(diff / 60000)
  if (mins  < 60)  return `${mins}m`
  const hrs  = Math.floor(diff / 3600000)
  if (hrs   < 24)  return `${hrs}h`
  const days = Math.floor(diff / 86400000)
  if (days === 1)  return 'Yesterday'
  if (days  <  7)  return `${days}d`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
function uid() { return Math.random().toString(36).slice(2,10) }

let toastTimer = null
function showToast(msg, duration = 2800) {
  toastEl.textContent = msg
  toastEl.classList.add('visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), duration)
}

// ── Command palette ───────────────────────────────────────────────────────────

function openPalette() {
  paletteIndex = 0
  palette.classList.remove('hidden')
  paletteInput.value = ''
  renderPaletteList()
  paletteInput.focus()
}

function closePalette() {
  palette.classList.add('hidden')
  paletteInput.value = ''
}

function renderPaletteList() {
  paletteList.innerHTML = ''
  const q = paletteInput.value.trim().toLowerCase()
  let results

  if (q) {
    results = allPlans.filter(p =>
      p.title.toLowerCase().includes(q)    ||
      p.repo.toLowerCase().includes(q)     ||
      p.summary?.toLowerCase().includes(q) ||
      p.trigger?.toLowerCase().includes(q)
    )
  } else {
    results = [...allPlans]
      .sort((a, b) => new Date(b.modified) - new Date(a.modified))
      .slice(0, 12)
  }

  if (!results.length) {
    paletteList.innerHTML = '<li class="palette-empty">No plans found</li>'
    return
  }

  results.forEach((plan, i) => {
    const li = document.createElement('li')
    li.className = 'palette-item' + (i === paletteIndex ? ' palette-active' : '')
    li.innerHTML = `
      <span class="palette-item-title">${escapeHtml(plan.title)}</span>
      <span class="palette-item-meta">${escapeHtml(plan.repo)} · ${formatDate(plan.modified)}</span>`
    li.addEventListener('mouseenter', () => {
      paletteIndex = i
      paletteList.querySelectorAll('.palette-item').forEach((el, j) =>
        el.classList.toggle('palette-active', j === i)
      )
    })
    li.addEventListener('click', () => { openPlan(plan); closePalette() })
    paletteList.appendChild(li)
  })
}

paletteInput.addEventListener('input', () => { paletteIndex = 0; renderPaletteList() })

paletteInput.addEventListener('keydown', e => {
  const items = paletteList.querySelectorAll('.palette-item')
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    paletteIndex = Math.min(paletteIndex + 1, items.length - 1)
    items.forEach((el, i) => el.classList.toggle('palette-active', i === paletteIndex))
    items[paletteIndex]?.scrollIntoView({ block: 'nearest' })
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    paletteIndex = Math.max(paletteIndex - 1, 0)
    items.forEach((el, i) => el.classList.toggle('palette-active', i === paletteIndex))
    items[paletteIndex]?.scrollIntoView({ block: 'nearest' })
  } else if (e.key === 'Enter') {
    items[paletteIndex]?.click()
  } else if (e.key === 'Escape') {
    closePalette()
  }
})

paletteBackdrop.addEventListener('click', closePalette)

// ── Diff view ─────────────────────────────────────────────────────────────────

function lcsOps(a, b) {
  const m = a.length, n = b.length
  const dp = new Array(m + 1)
  for (let i = 0; i <= m; i++) dp[i] = new Int32Array(n + 1)
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1])
    }
  }
  const ops = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
      ops.push({ type: 'equal', value: a[i-1] }); i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      ops.push({ type: 'insert', value: b[j-1] }); j--
    } else {
      ops.push({ type: 'delete', value: a[i-1] }); i--
    }
  }
  return ops.reverse()
}

function buildHunks(ops, context = 4) {
  const changes = ops.reduce((acc, op, i) => { if (op.type !== 'equal') acc.push(i); return acc }, [])
  if (!changes.length) return []
  const ranges = []
  let rs = Math.max(0, changes[0] - context), re = Math.min(ops.length - 1, changes[0] + context)
  for (let k = 1; k < changes.length; k++) {
    const ns = Math.max(0, changes[k] - context), ne = Math.min(ops.length - 1, changes[k] + context)
    if (ns <= re + 1) { re = ne } else { ranges.push([rs, re]); rs = ns; re = ne }
  }
  ranges.push([rs, re])
  return ranges.map(([s, e]) => ops.slice(s, e + 1))
}

function renderDiff(oldContent, newContent) {
  diffPanel.innerHTML = ''
  const ops   = lcsOps(oldContent.split('\n'), newContent.split('\n'))
  const hunks = buildHunks(ops)

  if (!hunks.length) {
    diffPanel.innerHTML = '<p class="diff-no-changes">No changes between this version and current.</p>'
    return
  }

  const container = document.createElement('div')
  container.className = 'diff-container'

  hunks.forEach((hunk, hi) => {
    if (hi > 0) {
      const sep = document.createElement('div')
      sep.className = 'diff-separator'
      container.appendChild(sep)
    }
    hunk.forEach(op => {
      const row = document.createElement('div')
      row.className = `diff-line diff-${op.type}`
      const prefix = op.type === 'delete' ? '−' : op.type === 'insert' ? '+' : ' '
      row.innerHTML = `<span class="diff-gutter">${escapeHtml(prefix)}</span><span class="diff-text">${escapeHtml(op.value)}</span>`
      container.appendChild(row)
    })
  })

  diffPanel.appendChild(container)
}

diffBtn.addEventListener('click', async () => {
  if (!isDiffMode) {
    const currentContent = await window.planAPI.getPlanContent(activePlan)
    if (!currentContent || !activeContent) return

    isDiffMode = true
    docContent.classList.add('hidden')
    tocPanel.classList.add('hidden')
    diffPanel.classList.remove('hidden')
    renderDiff(activeContent, currentContent)
    diffBtn.textContent = 'Rendered'
  } else {
    isDiffMode = false
    diffPanel.classList.add('hidden')
    diffPanel.innerHTML = ''
    docContent.classList.remove('hidden')
    diffBtn.textContent = 'Diff'
  }
})

// ── Step-through mode ─────────────────────────────────────────────────────────

function splitIntoSections(content) {
  const body   = stripTitle(content).trim()
  const chunks = body.split(/^(?=## )/m).filter(c => c.trim())
  if (!chunks.length) return [{ title: 'Plan', content: body }]
  return chunks.map(chunk => {
    const m = chunk.match(/^## (.+)/)
    return { title: m ? m[1].trim() : 'Overview', content: chunk.trim() }
  })
}

function renderStep() {
  const sec    = stepSections[stepIndex]
  const total  = stepSections.length
  const isLast = stepIndex === total - 1

  // Step navigator — all sections as clickable pills
  stepNav.innerHTML = stepSections.map((s, i) => {
    const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'todo'
    const glyph = i < stepIndex ? '✓' : i === stepIndex ? '▶' : String(i + 1)
    return `<button class="step-nav-item step-nav-${state}" data-i="${i}">
      <span class="step-nav-num">${glyph}</span>
      <span class="step-nav-title">${escapeHtml(s.title)}</span>
    </button>`
  }).join('')

  stepNav.querySelectorAll('.step-nav-item').forEach(btn =>
    btn.addEventListener('click', () => { stepIndex = +btn.dataset.i; renderStep() })
  )
  stepNav.querySelector('.step-nav-active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })

  // Footer meta: position + what's next
  const nextSec = !isLast ? stepSections[stepIndex + 1] : null
  stepMeta.textContent = nextSec
    ? `${stepIndex + 1} / ${total}  ·  Next: ${nextSec.title}`
    : `${stepIndex + 1} / ${total}  ·  Last section`

  stepContent.innerHTML   = marked.parse(sec.content)
  stepPrevBtn.disabled    = stepIndex === 0
  stepNextBtn.textContent = isLast ? 'Done ✓' : 'Next →'
  stepNextBtn.className   = isLast ? 'btn-approve' : 'btn-send'
  stepBody.scrollTop = 0
}

const switcherIndicator = viewSwitcher.querySelector('.switcher-indicator')

function placeSwitcherIndicator(animate) {
  const activeBtn = isStepMode ? switcherStep : switcherFull
  if (!switcherIndicator || !activeBtn) return
  if (!animate) switcherIndicator.style.transition = 'none'
  requestAnimationFrame(() => {
    const vRect = viewSwitcher.getBoundingClientRect()
    const bRect = activeBtn.getBoundingClientRect()
    switcherIndicator.style.left  = (bRect.left - vRect.left) + 'px'
    switcherIndicator.style.width = bRect.width + 'px'
    if (!animate) {
      switcherIndicator.offsetWidth // force reflow
      switcherIndicator.style.transition = 'left 0.22s cubic-bezier(0.34,1.2,0.64,1), width 0.22s cubic-bezier(0.34,1.2,0.64,1)'
    }
  })
}

function enterStepMode() {
  stepSections = splitIntoSections(activeContent)
  if (!stepSections.length) return
  stepIndex  = 0
  isStepMode = true
  // Exit diff mode if active
  if (isDiffMode) {
    isDiffMode = false
    diffPanel.classList.add('hidden')
    diffPanel.innerHTML = ''
    diffBtn.textContent = 'Diff'
  }
  viewer.classList.add('hidden')
  stepPanel.classList.remove('hidden')
  renderStep()
  switcherFull.classList.remove('active')
  switcherStep.classList.add('active')
  placeSwitcherIndicator(true)
}

function exitStepMode() {
  isStepMode   = false
  stepSections = []
  stepPanel.classList.add('hidden')
  viewer.classList.remove('hidden')
  switcherStep.classList.remove('active')
  switcherFull.classList.add('active')
  placeSwitcherIndicator(true)
}

switcherFull.addEventListener('click', () => { if (isStepMode) exitStepMode() })
switcherStep.addEventListener('click', () => { if (!isStepMode) enterStepMode() })
stepPrevBtn.addEventListener('click', () => { if (stepIndex > 0) { stepIndex--; renderStep() } })
stepNextBtn.addEventListener('click', () => {
  if (stepIndex < stepSections.length - 1) { stepIndex++; renderStep() }
  else exitStepMode()
})

function buildFeedbackMessage() {
  if (comments.length === 0) {
    return activeContent + '\n\n---\n\nThe plan looks good — please proceed with the implementation.'
  }
  let msg = 'I\'ve reviewed the plan. Please revise it based on my comments below, then present the updated plan for approval.\n\n'
  msg += '---\n\n'
  msg += activeContent.trimEnd()
  msg += '\n\n---\n\nComments:\n\n'
  for (const c of comments) {
    msg += `> "${c.quote.substring(0, 200)}${c.quote.length > 200 ? '…' : ''}"\n`
    msg += `Note: ${c.note}\n\n`
  }
  return msg.trimEnd()
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function renderList(plans) {
  const q = searchInput.value.trim().toLowerCase()
  if (q) { renderSearch(plans, q); return }

  planList.innerHTML = ''

  const live   = plans.filter(p => p.live)
  const normal = plans.filter(p => !p.live)

  if (live.length) renderGroup('__live__', 'Live', live, true)

  const groups = new Map()
  for (const p of normal) {
    if (!groups.has(p.repo)) groups.set(p.repo, [])
    groups.get(p.repo).push(p)
  }

  ;[...groups.entries()]
    .sort((a, b) => new Date(b[1][0].modified) - new Date(a[1][0].modified))
    .forEach(([repo, rplans]) => renderGroup(repo, repo, rplans, false))
}

function renderSearch(plans, q) {
  const filtered = plans.filter(p =>
    p.title.toLowerCase().includes(q)    ||
    p.repo.toLowerCase().includes(q)     ||
    p.summary?.toLowerCase().includes(q) ||
    p.trigger?.toLowerCase().includes(q)
  )
  planList.innerHTML = ''
  if (!filtered.length) {
    planList.innerHTML = '<li class="no-results">No plans found</li>'
    return
  }
  filtered.forEach(p => appendPlanItem(p))
}

function renderGroup(key, label, plans, isLive) {
  const collapsed = collapsedGroups[key] || false
  const shown     = groupCounts[key] || PAGE_SIZE

  const li = document.createElement('li')
  li.className = 'repo-header' + (isLive ? ' live-header' : '') + (collapsed ? ' collapsed' : '')
  li.dataset.groupKey = key
  li.innerHTML = `
    <span class="repo-chevron">
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </span>
    <span class="repo-name">
      ${isLive ? '<span class="live-dot"></span>' : ''}${escapeHtml(label)}
    </span>
    <span class="repo-count">${plans.length}</span>`
  li.addEventListener('click', () => {
    collapsedGroups[key] = !collapsedGroups[key]
    renderList(allPlans)
  })
  planList.appendChild(li)

  if (collapsed) return

  plans.slice(0, shown).forEach(p => appendPlanItem(p))

  if (plans.length > shown) {
    const remaining = Math.min(PAGE_SIZE, plans.length - shown)
    const btn = document.createElement('button')
    btn.className = 'show-more-btn'
    btn.textContent = `Show ${remaining} more`
    btn.addEventListener('click', e => {
      e.stopPropagation()
      groupCounts[key] = shown + PAGE_SIZE
      renderList(allPlans)
    })
    planList.appendChild(btn)
  }
}

function appendPlanItem(plan) {
  const li = document.createElement('li')
  li.className = 'plan-item' + (plan.filename === activePlan ? ' active' : '')
  li.innerHTML = `
    <svg class="plan-icon" viewBox="0 0 11 13" width="11" height="13" fill="none" stroke="currentColor" stroke-width="1.1">
      <path d="M2 1h5.2L10 3.8V11.5a.5.5 0 01-.5.5H2a.5.5 0 01-.5-.5V1.5A.5.5 0 012 1z"/>
      <path d="M7.2 1v2.8H10"/>
    </svg>
    <span class="plan-title">${escapeHtml(plan.title)}</span>
    <span class="plan-date">${formatRelativeDate(plan.modified)}</span>`
  li.addEventListener('click', () => openPlan(plan))
  planList.appendChild(li)
}

searchInput.addEventListener('input', () => renderList(allPlans))

// ── Plan open ─────────────────────────────────────────────────────────────────

async function openPlan(plan) {
  activePlan      = plan.filename
  activeContent   = ''
  activeTrigger   = plan.trigger || null
  triggerExpanded = false
  snapshots       = []
  activeSnapshot  = null
  comments        = []
  pendingQuote    = ''
  tocPanel.classList.add('hidden')
  versionBanner.classList.add('hidden')
  isDiffMode = false
  diffBtn.classList.add('hidden')
  diffBtn.textContent = 'Diff'
  diffPanel.classList.add('hidden')
  diffPanel.innerHTML = ''
  if (isStepMode) {
    isStepMode   = false
    stepSections = []
    stepPanel.classList.add('hidden')
  }
  viewSwitcher.classList.remove('hidden')
  switcherFull.classList.add('active')
  switcherStep.classList.remove('active')
  hideTooltip()

  window.planAPI.setLastPlan(plan.filename)
  renderList(allPlans)

  const content = await window.planAPI.getPlanContent(plan.filename)
  if (!content) return
  activeContent = content

  const words = activeContent
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[^\w\s]/g, ' ')
    .trim().split(/\s+/).filter(Boolean).length
  const mins = Math.max(1, Math.round(words / 200))

  docTitle.textContent = plan.title
  docDate.textContent  = `${plan.repo}  ·  ${formatDate(plan.modified)}  ·  ~${words.toLocaleString()} words  ·  ${mins} min read`

  renderPreview()

  snapshots = await window.planAPI.getSnapshots(plan.filename)
  renderVersions()

  const saved = await window.planAPI.loadComments(plan.filename)
  comments = saved || []
  applyCommentHighlights()

  const isLive = plan.live
  liveBadge.classList.toggle('hidden', !isLive)
  liveBar.classList.toggle('hidden', !isLive)
  sendBtn.classList.toggle('hidden', !isLive)

  emptyState.classList.add('hidden')
  planHeader.classList.remove('hidden')
  viewer.classList.remove('hidden')
  placeSwitcherIndicator(false)

  docContent.scrollTop = 0
}

// ── Preview ───────────────────────────────────────────────────────────────────

function stripTitle(content) {
  return content.replace(/^#[^\n]*\n?/, '')
}

const TRIGGER_PREVIEW = 260

function triggerBlock() {
  if (!activeTrigger) return ''
  const needsToggle = activeTrigger.length > TRIGGER_PREVIEW
  const text = needsToggle && !triggerExpanded
    ? activeTrigger.substring(0, TRIGGER_PREVIEW).trimEnd() + '…'
    : activeTrigger
  return `<div class="plan-context">
    <span class="plan-context-label">Prompt</span>
    <p class="plan-context-text">${escapeHtml(text)}</p>
    ${needsToggle ? `<button class="plan-context-toggle">${triggerExpanded ? 'Show less' : 'Show more'}</button>` : ''}
  </div>`
}

function renderPreview() {
  docContent.innerHTML = triggerBlock() + marked.parse(stripTitle(activeContent))
}

// ── Copy dropdown ─────────────────────────────────────────────────────────────

copyBtn.addEventListener('click', e => {
  e.stopPropagation()
  copyMenu.classList.toggle('hidden')
})

document.addEventListener('click', () => copyMenu.classList.add('hidden'))

copyMarkdownBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(activeContent).catch(() => {})
  copyMenu.classList.add('hidden')
  showToast('Markdown copied')
})

copyTextBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(docContent.innerText).catch(() => {})
  copyMenu.classList.add('hidden')
  showToast('Plain text copied')
})

copyWithCommentsBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(buildFeedbackMessage()).catch(() => {})
  copyMenu.classList.add('hidden')
  showToast(comments.length > 0 ? 'Copied with comments' : 'Markdown copied')
})

// ── Version history ───────────────────────────────────────────────────────────

function renderVersions() {
  // Remove any existing version sub-items
  document.querySelectorAll('.version-item').forEach(el => el.remove())
  if (!snapshots.length) return

  const activeLi = planList.querySelector('.plan-item.active')
  if (!activeLi) return

  // Newest first: Current → most recent snapshot → … → v1 (oldest)
  const total = snapshots.length + 1
  const all   = [null, ...[...snapshots].reverse()] // null = current (always first)

  let insertAfter = activeLi
  all.forEach((ts, i) => {
    const isCurrent  = ts === null
    const vNum       = total - i  // current = vN, oldest snapshot = v1
    const isSelected = activeSnapshot === ts
    const el = document.createElement('div')
    el.className = 'version-item' + (isSelected ? ' version-active' : '')
    el.innerHTML = `
      <svg class="version-icon" viewBox="0 0 11 11" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1">
        <circle cx="5.5" cy="5.5" r="4"/>
        <path d="M5.5 3v2.5l1.5 1.2" stroke-linecap="round"/>
      </svg>
      <span class="version-label">v${vNum}</span>
      <span class="version-date">${isCurrent ? 'Current' : formatDate(new Date(ts).toISOString())}</span>`
    el.addEventListener('click', () => switchVersion(ts))
    insertAfter.after(el)
    insertAfter = el
  })
}

async function switchVersion(ts) {
  // Exit diff mode when switching versions
  if (isDiffMode) {
    isDiffMode = false
    docContent.classList.remove('hidden')
    diffPanel.classList.add('hidden')
    diffPanel.innerHTML = ''
    diffBtn.textContent = 'Diff'
  }

  activeSnapshot = ts
  const content = ts === null
    ? await window.planAPI.getPlanContent(activePlan)
    : await window.planAPI.getSnapshotContent(activePlan, ts)
  if (!content) return
  activeContent = content
  applyCommentHighlights()
  renderVersions()

  if (ts === null) {
    versionBanner.classList.add('hidden')
    diffBtn.classList.add('hidden')
  } else {
    const d = new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    versionBanner.innerHTML = `Viewing version from ${d} — <a class="version-banner-link">Back to current</a>`
    versionBanner.classList.remove('hidden')
    versionBanner.querySelector('.version-banner-link').addEventListener('click', () => switchVersion(null))
    diffBtn.classList.remove('hidden')
  }
}

// ── Table of contents ─────────────────────────────────────────────────────────

function buildToc() {
  const headings = [...docContent.querySelectorAll('h1, h2, h3')]
  tocList.innerHTML = ''

  if (headings.length < 2) { tocPanel.classList.add('hidden'); return }
  tocPanel.classList.remove('hidden')

  headings.forEach((h, i) => {
    if (!h.id) {
      h.id = 'h-' + h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '') + '-' + i
    }
    const li = document.createElement('li')
    li.className = `toc-item toc-${h.tagName.toLowerCase()}`
    li.dataset.hid = h.id
    li.textContent = h.textContent.trim()
    li.title = h.textContent.trim()
    li.addEventListener('click', () => h.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    tocList.appendChild(li)
  })

  updateTocActive()
}

function updateTocActive() {
  const headings = [...docContent.querySelectorAll('h1[id], h2[id], h3[id]')]
  if (!headings.length) return
  const containerTop = docContent.getBoundingClientRect().top
  let active = headings[0]
  for (const h of headings) {
    if (h.getBoundingClientRect().top - containerTop <= 72) active = h
  }
  tocList.querySelectorAll('.toc-item').forEach(li =>
    li.classList.toggle('toc-active', li.dataset.hid === active.id)
  )
}

docContent.addEventListener('scroll', updateTocActive)

docContent.addEventListener('click', e => {
  if (e.target.classList.contains('plan-context-toggle')) {
    const prev = docContent.scrollTop
    triggerExpanded = !triggerExpanded
    applyCommentHighlights()
    docContent.scrollTop = prev
  }
})

// ── Comment tooltip ───────────────────────────────────────────────────────────

let tooltipTimer = null
let activeTooltipId = null

function showTooltip(mark, comment) {
  clearTimeout(tooltipTimer)
  activeTooltipId = comment.id
  tooltipNote.textContent = comment.author
    ? `${comment.author}: ${comment.note}`
    : comment.note
  tooltipDelete.dataset.id = comment.id

  const rect = mark.getBoundingClientRect()
  const tipW = 240
  let left = rect.left + rect.width / 2 - tipW / 2
  if (left < 8) left = 8
  if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8

  commentTooltip.style.left = `${left}px`
  commentTooltip.style.top  = `${rect.top - 8}px` // will use transform to go above
  commentTooltip.classList.remove('hidden')
}

function hideTooltip(delay = 0) {
  clearTimeout(tooltipTimer)
  tooltipTimer = setTimeout(() => {
    commentTooltip.classList.add('hidden')
    activeTooltipId = null
  }, delay)
}

commentTooltip.addEventListener('mouseenter', () => clearTimeout(tooltipTimer))
commentTooltip.addEventListener('mouseleave', () => hideTooltip(100))

tooltipDelete.addEventListener('click', async () => {
  const id = tooltipDelete.dataset.id
  comments = comments.filter(c => c.id !== id)
  await window.planAPI.saveComments(activePlan, comments)
  hideTooltip()
  applyCommentHighlights()
})

// ── Comments ──────────────────────────────────────────────────────────────────

document.addEventListener('mouseup', e => {
  if (commentBubble.contains(e.target) || e.target === commentAddBtn) return

  // Clicked outside the bubble — always dismiss it
  if (!commentBubble.classList.contains('hidden')) {
    dismissCommentUI()
    return
  }

  if (!docContent.contains(e.target)) {
    dismissCommentUI()
    return
  }

  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.toString().trim().length < 2) {
    commentAddBtn.classList.add('hidden')
    return
  }

  const rect   = sel.getRangeAt(0).getBoundingClientRect()
  pendingQuote = sel.toString().trim()

  commentAddBtn.style.top  = `${rect.bottom + 8}px`
  commentAddBtn.style.left = `${rect.left + rect.width / 2}px`
  commentAddBtn.classList.remove('hidden')
})

commentAddBtn.addEventListener('click', e => {
  e.stopPropagation()
  const rect = commentAddBtn.getBoundingClientRect()
  let left = rect.left - 100
  if (left < 8) left = 8
  if (left + 280 > window.innerWidth - 8) left = window.innerWidth - 288

  commentBubble.style.top  = `${rect.bottom + 6}px`
  commentBubble.style.left = `${left}px`
  commentBubble.classList.remove('hidden')
  commentAddBtn.classList.add('hidden')
  commentInput.value = ''
  commentInput.focus()
})

commentCancelBtn.addEventListener('click', dismissCommentUI)
commentSaveBtn.addEventListener('click', saveComment)

commentInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveComment()
  if (e.key === 'Escape') dismissCommentUI()
})

function navigatePlan(dir) {
  if (!activePlan || !allPlans.length) return
  const idx  = allPlans.findIndex(p => p.filename === activePlan)
  const next = allPlans[idx + dir]
  if (next) openPlan(next)
}

// Global keyboard shortcuts
document.addEventListener('keydown', e => {
  const inInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA'

  // Escape — dismiss palette → exit step mode → dismiss comment UI
  if (e.key === 'Escape') {
    if (!palette.classList.contains('hidden')) { closePalette(); return }
    if (isStepMode) { exitStepMode(); return }
    dismissCommentUI()
    return
  }

  // ⌘K — open command palette
  if (e.metaKey && e.key === 'k') {
    e.preventDefault()
    openPalette()
    return
  }

  // ⌘F — focus sidebar search
  if (e.metaKey && e.key === 'f') {
    e.preventDefault()
    searchInput.focus()
    searchInput.select()
    return
  }

  // ⌘[ / ⌘] — prev / next plan
  if (e.metaKey && e.key === '[') { e.preventDefault(); navigatePlan(-1); return }
  if (e.metaKey && e.key === ']') { e.preventDefault(); navigatePlan(+1); return }

  // Arrow keys — step navigation (in step mode) or plan navigation (otherwise)
  if (!inInput) {
    if (isStepMode) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        if (stepIndex < stepSections.length - 1) { stepIndex++; renderStep() }
        else exitStepMode()
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (stepIndex > 0) { stepIndex--; renderStep() }
        return
      }
    }
    if (e.key === 'ArrowUp')   { e.preventDefault(); navigatePlan(-1); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); navigatePlan(+1); return }
  }
})

// ⌘↵ on selected text opens comment bubble directly
document.addEventListener('keydown', e => {
  if (!(e.metaKey && e.key === 'Enter')) return
  if (!pendingQuote) return
  e.preventDefault()

  const sel = window.getSelection()
  const rect = sel && !sel.isCollapsed
    ? sel.getRangeAt(0).getBoundingClientRect()
    : commentAddBtn.getBoundingClientRect()

  let left = rect.left + rect.width / 2 - 140
  if (left < 8) left = 8
  if (left + 280 > window.innerWidth - 8) left = window.innerWidth - 288

  commentBubble.style.top  = `${rect.bottom + 8}px`
  commentBubble.style.left = `${left}px`
  commentBubble.classList.remove('hidden')
  commentAddBtn.classList.add('hidden')
  commentInput.value = ''
  commentInput.focus()
})

function dismissCommentUI() {
  commentBubble.classList.add('hidden')
  commentAddBtn.classList.add('hidden')
  pendingQuote = ''
}

async function saveComment() {
  const note = commentInput.value.trim()
  if (!note || !pendingQuote) { dismissCommentUI(); return }

  let author = null
  if (window.WEB_MODE) {
    author = window.planAPI.getAuthorName?.() || ''
    if (!author) {
      author = prompt('Your name (shown with your comments):') || 'Anonymous'
      window.planAPI.setAuthorName?.(author)
    }
  }

  const comment = { id: uid(), quote: pendingQuote.substring(0, 300), note, timestamp: new Date().toISOString() }
  if (author) comment.author = author
  comments.push(comment)
  await window.planAPI.saveComments(activePlan, comments)
  dismissCommentUI()
  applyCommentHighlights()
  showToast('Comment added')
}

function highlightQuote(root, text, id) {
  if (!text) return

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.parentElement.closest('.plan-context, mark')
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT
  })

  const nodes = []
  let combined = ''
  let node
  while ((node = walker.nextNode())) {
    nodes.push({ node, start: combined.length })
    combined += node.textContent
  }

  const idx = combined.indexOf(text)
  if (idx === -1) return
  const end = idx + text.length

  // Collect every text-node segment that falls within [idx, end)
  const segs = []
  for (const { node: n, start } of nodes) {
    const nodeEnd = start + n.textContent.length
    if (nodeEnd <= idx || start >= end) continue
    segs.push({
      node: n,
      from: Math.max(idx, start) - start,
      to:   Math.min(end, nodeEnd) - start,
    })
  }
  if (!segs.length) return

  // Wrap each segment in its own <mark> (reverse so earlier offsets stay valid)
  for (let i = segs.length - 1; i >= 0; i--) {
    const { node: n, from, to } = segs[i]
    const range = document.createRange()
    range.setStart(n, from)
    range.setEnd(n, to)
    const mark = document.createElement('mark')
    mark.className = 'comment-mark'
    mark.dataset.id = id
    try { range.surroundContents(mark) } catch (_) {}
  }
}

function applyCommentHighlights() {
  docContent.innerHTML = triggerBlock() + marked.parse(stripTitle(activeContent))

  for (const c of comments) {
    highlightQuote(docContent, c.quote.substring(0, 200), c.id)
  }

  docContent.querySelectorAll('.comment-mark').forEach(mark => {
    mark.addEventListener('mouseenter', () => {
      const comment = comments.find(c => c.id === mark.dataset.id)
      if (comment) showTooltip(mark, comment)
    })
    mark.addEventListener('mouseleave', () => hideTooltip(100))
  })

  buildToc()
}

liveDismissBtn.addEventListener('click', async () => {
  await window.planAPI.dismissLive(activePlan)
  const plan = allPlans.find(p => p.filename === activePlan)
  if (plan) plan.live = false
  liveBadge.classList.add('hidden')
  liveBar.classList.add('hidden')
  sendBtn.classList.add('hidden')
  renderList(allPlans)
})

// ── Send to Claude ────────────────────────────────────────────────────────────

sendBtn.addEventListener('click', async () => {
  navigator.clipboard.writeText(buildFeedbackMessage()).catch(() => {})

  await window.planAPI.dismissLive(activePlan)
  const plan = allPlans.find(p => p.filename === activePlan)
  if (plan) plan.live = false
  liveBadge.classList.add('hidden')
  liveBar.classList.add('hidden')
  sendBtn.classList.add('hidden')
  renderList(allPlans)

  showToast(comments.length > 0
    ? 'Feedback copied — paste it in Claude Code'
    : 'Approval copied — paste it in Claude Code', 4000)
})

// ── Live updates ──────────────────────────────────────────────────────────────

async function loadPlans() {
  allPlans = await window.planAPI.getPlans()
  renderList(allPlans)
  const last = await window.planAPI.getLastPlan()
  if (last) {
    const plan = allPlans.find(p => p.filename === last)
    if (plan) openPlan(plan)
  }
}

window.planAPI.onPlanUpdated(async data => {
  const prev = activePlan
  allPlans = await window.planAPI.getPlans()
  renderList(allPlans)

  const newLive = data?.live
  if (newLive && newLive !== prev) {
    const plan = allPlans.find(p => p.filename === newLive)
    if (plan) openPlan(plan)
  } else if (newLive === prev && prev) {
    const content = await window.planAPI.getPlanContent(activePlan)
    if (content) {
      activeContent = content
      if (isStepMode) exitStepMode()
      else applyCommentHighlights()
    }
  } else if (data?.comments === activePlan) {
    // A browser client saved comments — reload them
    const saved = await window.planAPI.loadComments(activePlan)
    comments = saved || []
    applyCommentHighlights()
  }
})

loadPlans()
