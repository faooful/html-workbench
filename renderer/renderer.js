// ── State ─────────────────────────────────────────────────────────────────────

let allPlans        = []
let activePlan      = null
let activeContent   = ''
let activeTrigger   = null
let triggerExpanded = false
let snapshots       = []   // array of epoch-ms timestamps, oldest first
let activeSnapshot  = null // null = current; number = viewing that snapshot
let comments        = []
let currentReview   = null
let timelineEvents  = []
let pendingQuote    = ''
let paletteIndex    = 0
let paletteResults  = []
let paletteSearchPlans = []
let paletteOpenPlans = []
let paletteFilter = 'attention'
let paletteRenderFrame = null
let plansRefreshTimer = null
let pendingPlanUpdate = null
let refreshInFlight = false
let isDiffMode      = false
let stepSections    = []
let stepIndex       = 0
let isStepMode      = false
let openTabs        = []
let panelOpen       = false
let activePanel     = 'code'
let planReferences  = []
let activeRefPath   = null
let semanticMode    = 'semantic'

// Per-group expanded counts: repoKey → number shown (multiples of PAGE_SIZE)
const PAGE_SIZE   = 5
const groupCounts = {}

// Collapsed groups: repoKey → bool
const collapsedGroups = {}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const tabStrip            = document.getElementById('tab-strip')
const tabNewBtn           = document.getElementById('tab-new-btn')
const emptyState          = document.getElementById('empty-state')
const workspaceShell      = document.getElementById('workspace-shell')
const planHeader          = document.getElementById('plan-header')
const docTitle            = document.getElementById('doc-title')
const docDate             = document.getElementById('doc-date')
const liveBadge           = document.getElementById('live-badge')
const copyBtn             = document.getElementById('copy-btn')
const copyMenu            = document.getElementById('copy-menu')
const copyMarkdownBtn     = document.getElementById('copy-markdown-btn')
const copyTextBtn         = document.getElementById('copy-text-btn')
const copyWithCommentsBtn = document.getElementById('copy-with-comments-btn')
const approveBtn          = document.getElementById('approve-btn')
const sendBtn             = document.getElementById('send-btn')
const versionBanner       = document.getElementById('version-banner')
const reviewBanner        = document.getElementById('review-banner')
const readinessStrip      = document.getElementById('readiness-strip')
const liveBar             = document.getElementById('live-bar')
const liveDismissBtn      = document.getElementById('live-dismiss-btn')
const viewer              = document.getElementById('viewer')
const viewerBody          = document.getElementById('viewer-body')
const docContent          = document.getElementById('doc-content')
const commentAddBtn       = document.getElementById('comment-add-btn')
const commentBubble       = document.getElementById('comment-bubble')
const commentInput        = document.getElementById('comment-input')
const commentCancelBtn    = document.getElementById('comment-cancel-btn')
const commentSaveBtn      = document.getElementById('comment-save-btn')
const commentTooltip      = document.getElementById('comment-tooltip')
const tooltipNote         = document.getElementById('tooltip-note')
const tooltipDelete       = document.getElementById('tooltip-delete')
const annotationType      = document.getElementById('annotation-type')
const toastEl             = document.getElementById('toast')
const tocPanel            = document.getElementById('toc-panel')
const tocList             = document.getElementById('toc-list')
const palette             = document.getElementById('palette')
const paletteInput        = document.getElementById('palette-input')
const paletteFilters      = document.getElementById('palette-filters')
const paletteList         = document.getElementById('palette-list')
const paletteBackdrop     = document.getElementById('palette-backdrop')
const diffBtn             = document.getElementById('diff-btn')
const diffPanel           = document.getElementById('diff-panel')
const panelToggleBtn      = document.getElementById('panel-toggle-btn')
const contextPanel        = document.getElementById('context-panel')
const contextCodeTab      = document.getElementById('context-code-tab')
const contextChangesTab   = document.getElementById('context-changes-tab')
const contextReviewTab    = document.getElementById('context-review-tab')
const contextCloseBtn     = document.getElementById('context-close-btn')
const codeContext         = document.getElementById('code-context')
const changesContext      = document.getElementById('changes-context')
const reviewContext       = document.getElementById('review-context')
const fileChipRow         = document.getElementById('file-chip-row')
const filePreview         = document.getElementById('file-preview')
const changesToolbar      = document.getElementById('changes-toolbar')
const semanticDiffList    = document.getElementById('semantic-diff-list')
const reviewDetail        = document.getElementById('review-detail')
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
  document.getElementById('approve-btn')?.classList.add('hidden')
  document.getElementById('send-btn')?.classList.add('hidden')
  document.getElementById('live-dismiss-btn')?.classList.add('hidden')
} else {
  // Show sharing URL in sidebar footer
  window.planAPI.getSharingInfo?.().then(info => {
    if (!info?.url) return
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
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
function uid() { return Math.random().toString(36).slice(2,10) }

function planByFilename(filename) {
  return allPlans.find(p => p.filename === filename)
}

function indexPalettePlans() {
  paletteSearchPlans = allPlans.map(plan => ({
    plan,
    searchText: [
      plan.title,
      plan.repo,
      plan.summary,
      plan.trigger,
      statusLabelFor(plan.status || (plan.live ? 'needs_review' : 'reviewed')),
    ].filter(Boolean).join(' ').toLowerCase(),
  }))
}

function persistPrefs() {
  window.planAPI.setPrefs?.({ lastPlan: activePlan, openTabs }).catch(() => {})
}

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
  paletteOpenPlans = allPlans
  palette.classList.remove('hidden')
  paletteInput.value = ''
  renderPaletteFilters()
  renderPaletteList()
  paletteInput.focus()
}

function closePalette() {
  palette.classList.add('hidden')
  paletteInput.value = ''
  paletteOpenPlans = []
  if (paletteRenderFrame) {
    cancelAnimationFrame(paletteRenderFrame)
    paletteRenderFrame = null
  }
}

function renderPaletteList() {
  const previousScroll = paletteList.scrollTop
  paletteList.innerHTML = ''
  const q = paletteInput.value.trim().toLowerCase()
  const sourcePlans = paletteOpenPlans.length ? paletteOpenPlans : allPlans
  const sourceSearchPlans = paletteOpenPlans.length
    ? paletteOpenPlans.map(plan => ({
      plan,
      searchText: [
        plan.title,
        plan.repo,
        plan.summary,
        plan.trigger,
        statusLabelFor(plan.status || (plan.live ? 'needs_review' : 'reviewed')),
      ].filter(Boolean).join(' ').toLowerCase(),
    }))
    : paletteSearchPlans

  if (q) {
    paletteResults = sourceSearchPlans
      .filter(entry => entry.searchText.includes(q))
      .map(entry => entry.plan)
  } else {
    paletteResults = [...sourcePlans]
  }

  paletteResults = paletteResults
    .filter(planMatchesPaletteFilter)
    .sort(comparePlansForReview)
    .slice(0, q ? 50 : 24)

  if (paletteIndex >= paletteResults.length) paletteIndex = Math.max(0, paletteResults.length - 1)

  if (!paletteResults.length) {
    paletteList.innerHTML = '<li class="palette-empty">No plans found</li>'
    return
  }

  let lastRepo = null
  paletteResults.forEach((plan, i) => {
    if (plan.repo !== lastRepo) {
      const group = document.createElement('li')
      group.className = 'palette-group-label'
      group.textContent = plan.repo
      paletteList.appendChild(group)
      lastRepo = plan.repo
    }
    const status = plan.status || (plan.live ? 'needs_review' : 'reviewed')
    const statusLabel = statusLabelFor(status)
    const li = document.createElement('li')
    li.className = 'palette-item' + (i === paletteIndex ? ' palette-active' : '')
    li.dataset.index = String(i)
    li.innerHTML = `
      <span class="palette-icon status-${escapeHtml(status)}" title="${escapeHtml(statusLabel)}" aria-label="${escapeHtml(statusLabel)}"></span>
      <span class="palette-item-title">${escapeHtml(plan.title)}</span>
      <span class="palette-item-meta">${escapeHtml(planAttentionReason(plan))}</span>`
    paletteList.appendChild(li)
  })

  paletteList.scrollTop = previousScroll
}

const PALETTE_FILTERS = [
  { id: 'attention', label: 'Attention' },
  { id: 'needs_review', label: 'Needs review' },
  { id: 'changes_requested', label: 'Changes requested' },
  { id: 'approved', label: 'Approved' },
  { id: 'implemented', label: 'Implemented' },
  { id: 'all', label: 'All' },
]

function renderPaletteFilters() {
  if (!paletteFilters) return
  paletteFilters.innerHTML = PALETTE_FILTERS.map(filter =>
    `<button class="palette-filter${paletteFilter === filter.id ? ' active' : ''}" data-filter="${filter.id}">${filter.label}</button>`
  ).join('')
}

function planStatus(plan) {
  return plan.status || (plan.live ? 'needs_review' : 'reviewed')
}

function planMatchesPaletteFilter(plan) {
  const status = planStatus(plan)
  if (paletteFilter === 'all') return true
  if (paletteFilter === 'attention') return status === 'needs_review' || status === 'changes_requested'
  return status === paletteFilter
}

function comparePlansForReview(a, b) {
  const priority = {
    needs_review: 0,
    changes_requested: 1,
    in_progress: 2,
    approved: 3,
    implemented: 4,
    reviewed: 5,
  }
  const ap = priority[planStatus(a)] ?? 9
  const bp = priority[planStatus(b)] ?? 9
  if (ap !== bp) return ap - bp
  return new Date(b.modified) - new Date(a.modified)
}

function planChecklistProgress(plan) {
  const checklist = plan.review?.checklist || {}
  const total = REVIEW_CHECKLIST_ITEMS.length
  const done = REVIEW_CHECKLIST_ITEMS.filter(([key]) => checklist[key]).length
  return { done, total }
}

function planAttentionReason(plan) {
  const status = planStatus(plan)
  const progress = planChecklistProgress(plan)
  const annotations = Number(plan.review?.annotationCount || plan.review?.annotations?.length || 0)
  const bits = []
  if (status === 'needs_review') bits.push('Live')
  else bits.push(statusLabelFor(status))
  if (annotations) bits.push(`${annotations} ann.`)
  if (plan.review?.checklist) bits.push(`${progress.done}/${progress.total}`)
  if (plan.versionCount) bits.push(`v${plan.versionCount + 1}`)
  bits.push(formatRelativeDate(plan.modified))
  return bits.join(' · ')
}

function updatePaletteActive({ scroll = true } = {}) {
  const items = paletteList.querySelectorAll('.palette-item')
  items.forEach(el => el.classList.toggle('palette-active', Number(el.dataset.index) === paletteIndex))
  if (scroll) {
    paletteList.querySelector(`.palette-item[data-index="${paletteIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }
}

function paletteItemFromPoint(clientX, clientY) {
  const rect = paletteList.getBoundingClientRect()
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null
  return [...paletteList.querySelectorAll('.palette-item')].find(item => {
    const itemRect = item.getBoundingClientRect()
    return clientY >= itemRect.top && clientY <= itemRect.bottom
  }) || null
}

function openPaletteResult(index = paletteIndex) {
  const plan = paletteResults[index]
  if (!plan) return
  openPlan(plan)
  closePalette()
}

function schedulePaletteRender({ resetIndex = false } = {}) {
  if (resetIndex) paletteIndex = 0
  if (paletteRenderFrame) cancelAnimationFrame(paletteRenderFrame)
  paletteRenderFrame = requestAnimationFrame(() => {
    paletteRenderFrame = null
    renderPaletteList()
  })
}

paletteInput.addEventListener('input', () => schedulePaletteRender({ resetIndex: true }))

paletteFilters?.addEventListener('click', e => {
  const btn = e.target.closest?.('.palette-filter')
  if (!btn) return
  paletteFilter = btn.dataset.filter || 'attention'
  renderPaletteFilters()
  schedulePaletteRender({ resetIndex: true })
})

function activatePaletteItemFromEvent(e) {
  const item = e.target.closest?.('.palette-item') || paletteItemFromPoint(e.clientX, e.clientY)
  if (!item || !paletteList.contains(item)) return
  const nextIndex = Number(item.dataset.index)
  if (!Number.isFinite(nextIndex) || nextIndex === paletteIndex) return
  paletteIndex = nextIndex
  updatePaletteActive({ scroll: false })
}

function openPaletteItemFromEvent(e) {
  const item = e.target.closest?.('.palette-item') || paletteItemFromPoint(e.clientX, e.clientY)
  if (!item || !paletteList.contains(item)) return
  e.preventDefault()
  openPaletteResult(Number(item.dataset.index))
}

paletteList.addEventListener('pointerover', activatePaletteItemFromEvent)
paletteList.addEventListener('pointermove', activatePaletteItemFromEvent)
paletteList.addEventListener('mouseover', activatePaletteItemFromEvent)
paletteList.addEventListener('mousemove', activatePaletteItemFromEvent)

paletteList.addEventListener('pointerdown', e => {
  if (e.button !== 0) return
  openPaletteItemFromEvent(e)
})

paletteList.addEventListener('click', openPaletteItemFromEvent)

document.addEventListener('mousemove', e => {
  if (palette.classList.contains('hidden')) return
  activatePaletteItemFromEvent(e)
}, true)

document.addEventListener('pointermove', e => {
  if (palette.classList.contains('hidden')) return
  activatePaletteItemFromEvent(e)
}, true)

document.addEventListener('pointerdown', e => {
  if (palette.classList.contains('hidden') || e.button !== 0) return
  const item = paletteItemFromPoint(e.clientX, e.clientY)
  if (!item) return
  e.preventDefault()
  e.stopPropagation()
  openPaletteResult(Number(item.dataset.index))
}, true)

paletteInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    paletteIndex = Math.min(paletteIndex + 1, paletteResults.length - 1)
    updatePaletteActive({ scroll: true })
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    paletteIndex = Math.max(paletteIndex - 1, 0)
    updatePaletteActive({ scroll: true })
  } else if (e.key === 'Enter') {
    openPaletteResult()
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
  workspaceShell.classList.add('step-mode')
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
  workspaceShell.classList.remove('step-mode')
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
    return activeContent + '\n\n---\n\nApproved. Please proceed with the implementation.'
  }
  let msg = 'I\'ve reviewed the plan. Please revise it based on the structured annotations below, then present the updated plan for approval.\n\n'
  msg += '---\n\n'
  msg += activeContent.trimEnd()
  msg += '\n\n---\n\nReview checklist:\n\n'
  for (const [key, label] of REVIEW_CHECKLIST_ITEMS) {
    msg += `- ${getReviewChecklist()[key] ? '[x]' : '[ ]'} ${label}\n`
  }
  msg += '\n\n---\n\nAnnotations:\n\n'
  for (const group of groupedAnnotations(comments)) {
    msg += `### ${annotationTypeLabel(group.type)}\n\n`
    for (const c of group.items) {
      msg += `> "${c.quote.substring(0, 200)}${c.quote.length > 200 ? '…' : ''}"\n`
      msg += `Note: ${c.note}\n\n`
    }
  }
  return msg.trimEnd()
}

function groupedAnnotations(items) {
  const order = ['risk', 'question', 'replace', 'delete', 'insert', 'comment']
  return order
    .map(type => ({ type, items: items.filter(c => (c.type || 'comment') === type) }))
    .filter(group => group.items.length)
}

function annotationTypeLabel(type) {
  return {
    comment: 'Comment',
    question: 'Question',
    risk: 'Risk',
    replace: 'Replace',
    delete: 'Delete',
    insert: 'Insert',
  }[type] || 'Comment'
}

function blockingAnnotations(items = comments) {
  const blocking = new Set(['risk', 'question', 'replace', 'delete'])
  return items.filter(c => blocking.has(c.type || 'comment'))
}

function checklistProgress(checklist = getReviewChecklist()) {
  const total = REVIEW_CHECKLIST_ITEMS.length
  const done = REVIEW_CHECKLIST_ITEMS.filter(([key]) => checklist[key]).length
  return { done, total }
}

function readinessState() {
  const checklist = getReviewChecklist()
  const progress = checklistProgress(checklist)
  const blockers = blockingAnnotations()
  const unresolvedRefs = planReferences.filter(ref => !ref.exists).length
  const reasons = []
  if (allPlans.find(p => p.filename === activePlan)?.live) reasons.push('Live plan')
  if (progress.done < progress.total) reasons.push(`${progress.total - progress.done} checklist items open`)
  if (blockers.length) reasons.push(`${blockers.length} blocking annotations`)
  if (unresolvedRefs) reasons.push(`${unresolvedRefs} unresolved file refs`)

  if (blockers.length) {
    return { id: 'changes', label: 'Changes likely needed', tone: 'warning', reasons, progress, blockers, unresolvedRefs }
  }
  if (progress.done === progress.total && !unresolvedRefs) {
    return { id: 'ready', label: 'Ready to approve', tone: 'success', reasons: reasons.length ? reasons : ['Review complete'], progress, blockers, unresolvedRefs }
  }
  return { id: 'needs', label: 'Needs review', tone: 'neutral', reasons, progress, blockers, unresolvedRefs }
}

function renderReadinessStrip() {
  if (!readinessStrip) return
  readinessStrip.className = 'hidden'
  readinessStrip.innerHTML = ''
  if (!activePlan || currentReview?.decision === 'approved' || currentReview?.decision === 'changes_requested' || currentReview?.decision === 'dismissed') return

  const state = readinessState()
  readinessStrip.classList.remove('hidden')
  readinessStrip.classList.add(`readiness-${state.tone}`)
  readinessStrip.innerHTML = `
    <div class="readiness-main">
      <span class="readiness-label">${escapeHtml(state.label)}</span>
      <span class="readiness-meta">${state.progress.done}/${state.progress.total} checklist · ${comments.length} ${comments.length === 1 ? 'annotation' : 'annotations'}</span>
    </div>
    <div class="readiness-reasons">${state.reasons.slice(0, 3).map(reason => `<span>${escapeHtml(reason)}</span>`).join('')}</div>
    <button id="readiness-review-btn" class="btn-ghost">Review</button>`
  readinessStrip.querySelector('#readiness-review-btn')?.addEventListener('click', () => setPanel(true, 'review'))
}

function reviewDecisionLabel(decision) {
  return {
    approved: 'Approved',
    changes_requested: 'Changes requested',
    dismissed: 'Dismissed',
  }[decision] || 'Reviewed'
}

function buildReviewPayload(decision) {
  const summary = {
    approved: 'Plan approved for implementation.',
    changes_requested: `Requested changes with ${comments.length} structured ${comments.length === 1 ? 'annotation' : 'annotations'}.`,
    dismissed: 'Plan dismissed without approval.',
    draft: 'Draft review checklist.',
  }[decision] || 'Plan reviewed.'
  return {
    decision,
    decidedAt: new Date().toISOString(),
    annotationCount: comments.length,
    annotations: comments.map(c => ({
      id: c.id,
      type: c.type || 'comment',
      quote: c.quote,
      note: c.note,
      author: c.author || null,
      timestamp: c.timestamp,
    })),
    checklist: getReviewChecklist(),
    summary,
    source: window.WEB_MODE ? 'web' : 'desktop',
  }
}

function renderReviewBanner() {
  if (!reviewBanner) return
  reviewBanner.className = 'hidden'
  reviewBanner.textContent = ''
  if (!currentReview || allPlans.find(p => p.filename === activePlan)?.live) return

  const decision = currentReview.decision || 'reviewed'
  if (decision === 'draft') return
  const count = Number(currentReview.annotationCount || currentReview.annotations?.length || 0)
  const date = currentReview.decidedAt ? formatDate(currentReview.decidedAt) : 'previously'
  reviewBanner.classList.remove('hidden')
  reviewBanner.classList.add(decision === 'changes_requested' ? 'changes-requested' : decision)
  reviewBanner.textContent = `${reviewDecisionLabel(decision)} ${date}${count ? ` · ${count} ${count === 1 ? 'annotation' : 'annotations'}` : ''}`
}

// ── Plan tabs ─────────────────────────────────────────────────────────────────

function normalizeOpenTabs() {
  const valid = new Set(allPlans.map(p => p.filename))
  openTabs = [...new Set(openTabs)].filter(f => valid.has(f))
}

function ensureOpenTab(filename) {
  if (!filename) return
  if (!openTabs.includes(filename)) openTabs.push(filename)
}

function renderTabs() {
  normalizeOpenTabs()
  if (!tabStrip) {
    persistPrefs()
    return
  }
  tabStrip.innerHTML = ''

  for (const filename of openTabs) {
    const plan = planByFilename(filename)
    if (!plan) continue
    const status = plan.status || (plan.live ? 'needs_review' : 'reviewed')
    const statusLabel = statusLabelFor(status)
    const tab = document.createElement('button')
    tab.className = 'plan-tab' + (filename === activePlan ? ' active' : '') + (plan.live ? ' live-tab' : '')
    tab.title = plan.title
    tab.innerHTML = `
      <span class="tab-status status-${escapeHtml(status)}" title="${escapeHtml(statusLabel)}" aria-label="${escapeHtml(statusLabel)}"></span>
      <span class="tab-title">${escapeHtml(plan.title)}</span>
      <span class="tab-meta">${escapeHtml(plan.repo)}</span>
      <span class="tab-close" title="Close">×</span>`
    tab.addEventListener('click', () => openPlan(plan, { fromTab: true }))
    tab.querySelector('.tab-close').addEventListener('click', e => {
      e.stopPropagation()
      closeTab(filename)
    })
    tabStrip.appendChild(tab)
  }
  persistPrefs()
}

function statusLabelFor(status) {
  return {
    needs_review: 'Needs review',
    changes_requested: 'Changes requested',
    in_progress: 'In progress',
    implemented: 'Implemented',
    approved: 'Approved',
    draft: 'Draft review',
    reviewed: 'Reviewed',
  }[status] || 'Reviewed'
}

function closeTab(filename) {
  const idx = openTabs.indexOf(filename)
  if (idx === -1) return
  openTabs.splice(idx, 1)

  if (activePlan === filename) {
    const nextFilename = openTabs[Math.min(idx, openTabs.length - 1)]
    if (nextFilename) {
      const nextPlan = planByFilename(nextFilename)
      if (nextPlan) openPlan(nextPlan, { fromTab: true })
    } else {
      activePlan = null
      activeContent = ''
      activeTrigger = null
      comments = []
      currentReview = null
      timelineEvents = []
      snapshots = []
      planHeader.classList.add('hidden')
      viewer.classList.add('hidden')
      stepPanel.classList.add('hidden')
      versionBanner.classList.add('hidden')
      reviewBanner?.classList.add('hidden')
      readinessStrip?.classList.add('hidden')
      liveBar.classList.add('hidden')
      emptyState.classList.remove('hidden')
      panelToggleBtn.classList.add('hidden')
      contextPanel.classList.add('hidden')
    }
  }
  renderTabs()
}

function renderList() {
  renderTabs()
}

tabNewBtn?.addEventListener('click', openPalette)

// ── Plan open ─────────────────────────────────────────────────────────────────

async function openPlan(plan, opts = {}) {
  activePlan      = plan.filename
  activeContent   = ''
  activeTrigger   = plan.trigger || null
  triggerExpanded = false
  snapshots       = []
  activeSnapshot  = null
  comments        = []
  currentReview   = null
  timelineEvents  = []
  pendingQuote    = ''
  planReferences  = []
  activeRefPath   = null
  tocPanel.classList.add('hidden')
  versionBanner.classList.add('hidden')
  reviewBanner?.classList.add('hidden')
  readinessStrip?.classList.add('hidden')
  isDiffMode = false
  diffBtn.classList.add('hidden')
  diffBtn.textContent = 'Diff'
  diffPanel.classList.add('hidden')
  diffPanel.innerHTML = ''
  if (isStepMode) {
    isStepMode   = false
    stepSections = []
    workspaceShell.classList.remove('step-mode')
    stepPanel.classList.add('hidden')
  }
  viewSwitcher.classList.remove('hidden')
  switcherFull.classList.add('active')
  switcherStep.classList.remove('active')
  hideTooltip()

  if (!opts.fromTab) ensureOpenTab(plan.filename)
  window.planAPI.setLastPlan(plan.filename)
  renderTabs()

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
  await loadPlanReferences()
  renderContextPanel()

  const saved = await window.planAPI.loadComments(plan.filename)
  comments = saved || []
  currentReview = await window.planAPI.loadReview?.(plan.filename).catch(() => null) || plan.review || null
  timelineEvents = await window.planAPI.loadTimeline?.(plan.filename).catch(() => []) || []
  applyCommentHighlights()

  const isLive = plan.live
  liveBadge.classList.toggle('hidden', !isLive)
  liveBar.classList.toggle('hidden', !isLive)
  approveBtn?.classList.toggle('hidden', !isLive)
  sendBtn.classList.toggle('hidden', !isLive)
  renderReviewBanner()
  renderReadinessStrip()
  panelToggleBtn.classList.remove('hidden')
  diffBtn.classList.add('hidden')

  emptyState.classList.add('hidden')
  planHeader.classList.remove('hidden')
  viewer.classList.remove('hidden')
  placeSwitcherIndicator(false)
  persistPrefs()

  viewerBody.scrollTop = 0
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

// ── Right context panel ───────────────────────────────────────────────────────

async function loadPlanReferences() {
  try {
    planReferences = await window.planAPI.getPlanReferences?.(activePlan) || []
  } catch (_) {
    planReferences = []
  }
  activeRefPath = planReferences.find(r => r.exists)?.path || planReferences[0]?.path || null
}

function referenceRootLabel() {
  const root = planReferences.find(r => r.root)?.root
  return root ? `<br><span class="panel-empty-muted">Project root: ${escapeHtml(root)}</span>` : ''
}

function setPanel(open, panel = activePanel) {
  panelOpen = open
  activePanel = panel
  workspaceShell.classList.toggle('inspector-open', panelOpen)
  contextPanel.classList.toggle('hidden', !panelOpen)
  panelToggleBtn.classList.toggle('panel-open', panelOpen)
  panelToggleBtn.textContent = '◫'
  renderContextPanel()
}

function renderContextPanel() {
  if (!activePlan) return
  workspaceShell.classList.toggle('inspector-open', panelOpen)
  contextPanel.classList.toggle('hidden', !panelOpen)
  panelToggleBtn.classList.toggle('panel-open', panelOpen)
  contextCodeTab.classList.toggle('active', activePanel === 'code')
  contextChangesTab.classList.toggle('active', activePanel === 'changes')
  contextReviewTab?.classList.toggle('active', activePanel === 'review')
  codeContext.classList.toggle('hidden', activePanel !== 'code')
  changesContext.classList.toggle('hidden', activePanel !== 'changes')
  reviewContext?.classList.toggle('hidden', activePanel !== 'review')
  panelToggleBtn.textContent = '◫'
  if (activePanel === 'code') renderCodePanel()
  else if (activePanel === 'changes') renderChangesPanel()
  else renderReviewPanel()
}

function renderReviewPanel() {
  if (!reviewDetail) return
  const annotations = currentReview?.annotations?.length ? currentReview.annotations : comments
  const checklist = currentReview?.checklist || defaultReviewChecklist()
  if (!currentReview && !annotations.length) {
    reviewDetail.innerHTML = `
      ${reviewChecklistHtml(checklist)}
      ${timelineHtml()}
      <div class="panel-empty"><strong>No review yet.</strong><br>Approve the live plan or add annotations and request changes to create a review record.</div>`
    wireReviewChecklist()
    return
  }

  const decision = currentReview?.decision || 'draft'
  const decidedAt = currentReview?.decidedAt ? formatDate(currentReview.decidedAt) : 'Not decided'
  reviewDetail.innerHTML = `
    <div class="review-summary-card ${escapeHtml(decision)}">
      <div class="review-summary-label">Review</div>
      <div class="review-summary-title">${escapeHtml(decision === 'draft' ? 'Draft annotations' : reviewDecisionLabel(decision))}</div>
      <div class="review-summary-meta">${escapeHtml(decidedAt)} · ${annotations.length} ${annotations.length === 1 ? 'annotation' : 'annotations'}</div>
    </div>
    ${reviewChecklistHtml(checklist)}
    ${timelineHtml()}
    <div class="review-annotation-list">
      ${annotations.length ? annotations.map(annotationCard).join('') : '<div class="panel-empty">No annotations were attached to this decision.</div>'}
    </div>`
  wireReviewChecklist()
}

function timelineHtml() {
  const events = [...timelineEvents].reverse().slice(0, 8)
  if (!events.length) return '<div class="review-timeline"><div class="review-checklist-title">Timeline</div><div class="panel-empty">No timeline events yet.</div></div>'
  return `<div class="review-timeline">
    <div class="review-checklist-title">Timeline</div>
    ${events.map(event => `<div class="timeline-event">
      <span class="timeline-dot"></span>
      <div>
        <div class="timeline-summary">${escapeHtml(event.summary || timelineEventLabel(event.type))}</div>
        <div class="timeline-meta">${escapeHtml(timelineEventLabel(event.type))} · ${escapeHtml(formatRelativeDate(event.at))}</div>
      </div>
    </div>`).join('')}
  </div>`
}

function timelineEventLabel(type) {
  return {
    created: 'Created',
    revised: 'Revised',
    annotated: 'Annotated',
    checklist_updated: 'Checklist updated',
    approved: 'Approved',
    changes_requested: 'Changes requested',
    dismissed: 'Dismissed',
  }[type] || 'Event'
}

const REVIEW_CHECKLIST_ITEMS = [
  ['scope_clear', 'Scope clear'],
  ['files_identified', 'Files identified'],
  ['risks_noted', 'Risks noted'],
  ['tests_included', 'Tests included'],
  ['ambiguities_resolved', 'Ambiguities resolved'],
]

function defaultReviewChecklist() {
  return REVIEW_CHECKLIST_ITEMS.reduce((acc, [key]) => {
    acc[key] = false
    return acc
  }, {})
}

function getReviewChecklist() {
  const base = { ...defaultReviewChecklist(), ...(currentReview?.checklist || {}) }
  if (!reviewDetail) return base
  reviewDetail.querySelectorAll('[data-review-check]').forEach(input => {
    base[input.dataset.reviewCheck] = input.checked
  })
  return base
}

function reviewChecklistHtml(checklist) {
  const normalized = { ...defaultReviewChecklist(), ...(checklist || {}) }
  const disabled = window.WEB_MODE ? 'disabled' : ''
  return `<div class="review-checklist">
    <div class="review-checklist-title">Checklist</div>
    ${REVIEW_CHECKLIST_ITEMS.map(([key, label]) => `
      <label class="review-check-item">
        <input type="checkbox" data-review-check="${key}" ${normalized[key] ? 'checked' : ''} ${disabled}>
        <span>${label}</span>
      </label>`).join('')}
    ${window.WEB_MODE ? '<div class="review-readonly-note">Review decisions are saved in the desktop app.</div>' : ''}
  </div>`
}

function wireReviewChecklist() {
  reviewDetail?.querySelectorAll('[data-review-check]').forEach(input => {
    input.addEventListener('change', saveDraftReviewChecklist)
  })
}

async function saveDraftReviewChecklist() {
  if (window.WEB_MODE || !activePlan) return
  const checklist = getReviewChecklist()
  currentReview = await window.planAPI.saveReview?.(activePlan, {
    ...(currentReview || {}),
    decision: currentReview?.decision || 'draft',
    decidedAt: currentReview?.decidedAt || new Date().toISOString(),
    annotations: currentReview?.annotations || comments,
    annotationCount: currentReview?.annotationCount ?? comments.length,
    checklist,
    summary: currentReview?.summary || 'Draft review checklist.',
    source: 'desktop',
  }).catch(() => currentReview)
  timelineEvents = await window.planAPI.loadTimeline?.(activePlan).catch(() => timelineEvents) || timelineEvents
  renderReviewBanner()
  renderReadinessStrip()
}

function annotationCard(annotation) {
  const type = annotation.type || 'comment'
  return `<div class="review-annotation ${annotationClass(type)}">
    <div class="review-annotation-type">${escapeHtml(annotationTypeLabel(type))}</div>
    <blockquote>${escapeHtml(annotation.quote || '').substring(0, 220)}</blockquote>
    <p>${escapeHtml(annotation.note || '')}</p>
  </div>`
}

function renderCodePanel() {
  fileChipRow.innerHTML = ''
  if (!planReferences.length) {
    filePreview.innerHTML = '<div class="panel-empty"><strong>No referenced source files found.</strong><br>This plan does not mention code paths that the inspector can safely preview.</div>'
    return
  }

  for (const ref of planReferences) {
    const chip = document.createElement('button')
    chip.className = 'file-chip' + (ref.path === activeRefPath ? ' active' : '') + (!ref.exists ? ' unresolved' : '')
    chip.textContent = ref.path
    chip.title = ref.exists ? ref.path : `${ref.path} was not found from the inferred project root`
    chip.addEventListener('click', async () => {
      activeRefPath = ref.path
      renderCodePanel()
      await renderFilePreview(ref.path)
    })
    fileChipRow.appendChild(chip)
  }

  const resolvedCount = planReferences.filter(ref => ref.exists).length
  if (!resolvedCount) {
    const count = planReferences.length
    filePreview.innerHTML = `<div class="panel-empty"><strong>${count} possible ${count === 1 ? 'file was' : 'files were'} mentioned, but none resolved.</strong><br>The inspector only previews files inside the inferred project root. These chips are still useful as implementation clues, but no readable source file was found.${referenceRootLabel()}</div>`
    return
  }

  renderFilePreview(activeRefPath)
}

async function renderFilePreview(refPath) {
  if (!refPath) {
    filePreview.innerHTML = '<div class="panel-empty">Select a referenced file.</div>'
    return
  }
  const ref = planReferences.find(r => r.path === refPath)
  if (ref && !ref.exists) {
    filePreview.innerHTML = `<div class="panel-empty"><strong>${escapeHtml(ref.path)}</strong><br>Could not resolve this file inside the inferred project root.${referenceRootLabel()}</div>`
    return
  }
  filePreview.innerHTML = '<div class="panel-empty">Loading file…</div>'
  const file = await window.planAPI.getReferencedFile?.(activePlan, refPath)
  if (!file || file.truncated) {
    filePreview.innerHTML = `<div class="panel-empty"><strong>${escapeHtml(refPath)}</strong><br>${file?.truncated ? 'File is too large to preview.' : 'File could not be loaded.'}</div>`
    return
  }
  const lines = file.content.split('\n').slice(0, 420)
  filePreview.innerHTML = `<div class="file-preview-title">${escapeHtml(refPath)}</div><pre class="code-preview">${lines.map((line, i) =>
    `<span class="code-row"><span class="code-line-no">${i + 1}</span><span class="code-line">${highlightCodeLine(line)}</span></span>`
  ).join('')}</pre>`
}

function highlightCodeLine(line) {
  let s = escapeHtml(line)
  s = s.replace(/(\/\/.*$)/, '<span class="code-comment">$1</span>')
  s = s.replace(/\b(import|export|const|let|var|function|return|if|else|for|while|class|async|await|from)\b/g, '<span class="code-keyword">$1</span>')
  s = s.replace(/(&quot;.*?&quot;|'.*?'|`.*?`)/g, '<span class="code-string">$1</span>')
  return s
}

function splitSectionsForDiff(content) {
  const body = stripTitle(content).trim()
  const chunks = body.split(/^(?=## )/m).filter(c => c.trim())
  if (!chunks.length) return [{ title: 'Plan', content: body }]
  return chunks.map(chunk => {
    const m = chunk.match(/^## (.+)$/m)
    return { title: m ? m[1].trim() : 'Overview', content: chunk.trim() }
  })
}

function renderVersionBadges() {
  const total = snapshots.length + 1
  const all = [null, ...[...snapshots].reverse()]
  return all.map((ts, i) => {
    const vNum = total - i
    const active = activeSnapshot === ts
    const label = ts === null ? `v${vNum} Current` : `v${vNum}`
    return `<button class="version-badge${active ? ' active' : ''}" data-ts="${ts || ''}">${label}</button>`
  }).join('')
}

async function renderChangesPanel() {
  changesToolbar.innerHTML = `
    <div class="version-badges">${renderVersionBadges()}</div>
    <div class="diff-mode-toggle">
      <button class="${semanticMode === 'semantic' ? 'active' : ''}" data-mode="semantic">Semantic</button>
      <button class="${semanticMode === 'unified' ? 'active' : ''}" data-mode="unified">Unified</button>
    </div>`
  changesToolbar.querySelectorAll('.version-badge').forEach(btn => {
    btn.addEventListener('click', () => switchVersion(btn.dataset.ts ? Number(btn.dataset.ts) : null))
  })
  changesToolbar.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      semanticMode = btn.dataset.mode
      renderChangesPanel()
    })
  })

  if (activeSnapshot === null) {
    semanticDiffList.innerHTML = '<div class="panel-empty">Select a previous version to compare it with the current plan.</div>'
    return
  }
  const current = await window.planAPI.getPlanContent(activePlan)
  const old = await window.planAPI.getSnapshotContent(activePlan, activeSnapshot)
  if (!current || !old) {
    semanticDiffList.innerHTML = '<div class="panel-empty">Could not load this comparison.</div>'
    return
  }
  semanticDiffList.innerHTML = semanticMode === 'unified'
    ? renderUnifiedDiff(old, current)
    : renderSemanticDiff(old, current)
}

function renderSemanticDiff(oldContent, newContent) {
  const oldMap = new Map(splitSectionsForDiff(oldContent).map(s => [s.title, s.content]))
  const newMap = new Map(splitSectionsForDiff(newContent).map(s => [s.title, s.content]))
  const titles = [...new Set([...oldMap.keys(), ...newMap.keys()])]
  const cards = []
  for (const title of titles) {
    const oldSec = oldMap.get(title)
    const newSec = newMap.get(title)
    if (!oldSec && newSec) cards.push(diffCard('added', title, newSec))
    else if (oldSec && !newSec) cards.push(diffCard('removed', title, oldSec))
    else if (oldSec !== newSec) cards.push(diffCard('modified', title, newSec))
  }
  return cards.length ? cards.join('') : '<div class="panel-empty">No section-level changes found.</div>'
}

function diffCard(type, title, content) {
  const label = type === 'added' ? 'Added' : type === 'removed' ? 'Removed' : 'Modified'
  return `<section class="semantic-card ${type}">
    <header><span>${label}</span><strong>${escapeHtml(title)}</strong></header>
    <div>${marked.parse(content.replace(/^## .+\n?/, '').trim() || content)}</div>
  </section>`
}

function renderUnifiedDiff(oldContent, newContent) {
  const ops = lcsOps(oldContent.split('\n'), newContent.split('\n'))
  const hunks = buildHunks(ops, 3)
  if (!hunks.length) return '<div class="panel-empty">No changes between these versions.</div>'
  return `<div class="panel-unified-diff">${hunks.map(hunk => hunk.map(op => {
    const prefix = op.type === 'delete' ? '−' : op.type === 'insert' ? '+' : ' '
    return `<div class="diff-line diff-${op.type}"><span class="diff-gutter">${prefix}</span><span class="diff-text">${escapeHtml(op.value)}</span></div>`
  }).join('')).join('<div class="diff-separator"></div>')}</div>`
}

panelToggleBtn.addEventListener('click', () => setPanel(!panelOpen, activePanel))
contextCodeTab.addEventListener('click', () => setPanel(true, 'code'))
contextChangesTab.addEventListener('click', () => setPanel(true, 'changes'))
contextReviewTab?.addEventListener('click', () => setPanel(true, 'review'))
contextCloseBtn.addEventListener('click', () => setPanel(false))

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
  renderContextPanel()
}

async function switchVersion(ts) {
  if (isDiffMode) {
    isDiffMode = false
    docContent.classList.remove('hidden')
    diffPanel.classList.add('hidden')
    diffPanel.innerHTML = ''
    diffBtn.textContent = 'Diff'
  }

  activeSnapshot = ts
  if (ts === null) {
    versionBanner.classList.add('hidden')
    diffBtn.classList.add('hidden')
  } else {
    const d = new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    versionBanner.innerHTML = `Comparing version from ${d} — <a class="version-banner-link">Back to current</a>`
    versionBanner.classList.remove('hidden')
    versionBanner.querySelector('.version-banner-link').addEventListener('click', () => switchVersion(null))
    diffBtn.classList.add('hidden')
  }
  renderContextPanel()
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
  const containerTop = viewerBody.getBoundingClientRect().top
  const atBottom = viewerBody.scrollTop + viewerBody.clientHeight >= viewerBody.scrollHeight - 8
  let active = headings[0]
  if (atBottom) {
    active = headings[headings.length - 1]
  } else {
    for (const h of headings) {
      if (h.getBoundingClientRect().top - containerTop <= 72) active = h
    }
  }
  tocList.querySelectorAll('.toc-item').forEach(li =>
    li.classList.toggle('toc-active', li.dataset.hid === active.id)
  )
}

viewerBody.addEventListener('scroll', updateTocActive)

docContent.addEventListener('click', e => {
  if (e.target.classList.contains('plan-context-toggle')) {
    const prev = viewerBody.scrollTop
    triggerExpanded = !triggerExpanded
    applyCommentHighlights()
    viewerBody.scrollTop = prev
  }
})

// ── Comment tooltip ───────────────────────────────────────────────────────────

let tooltipTimer = null
let activeTooltipId = null

function showTooltip(mark, comment) {
  clearTimeout(tooltipTimer)
  activeTooltipId = comment.id
  const label = annotationTypeLabel(comment.type || 'comment')
  tooltipNote.textContent = comment.author
    ? `${label} · ${comment.author}: ${comment.note}`
    : `${label}: ${comment.note}`
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
  timelineEvents = await window.planAPI.loadTimeline?.(activePlan).catch(() => timelineEvents) || timelineEvents
  hideTooltip()
  applyCommentHighlights()
  renderReadinessStrip()
  if (activePanel === 'review') renderReviewPanel()
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
  if (annotationType) annotationType.value = 'comment'
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
  if (!activePlan) return
  const source = openTabs.length ? openTabs.map(planByFilename).filter(Boolean) : allPlans
  const idx  = source.findIndex(p => p.filename === activePlan)
  const next = source[idx + dir]
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

  // ⌘F — use the picker as primary search
  if (e.metaKey && e.key === 'f') {
    e.preventDefault()
    openPalette()
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
  if (annotationType) annotationType.value = 'comment'
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

  const type = annotationType?.value || 'comment'
  const comment = { id: uid(), type, quote: pendingQuote.substring(0, 300), note, timestamp: new Date().toISOString() }
  if (author) comment.author = author
  comments.push(comment)
  await window.planAPI.saveComments(activePlan, comments)
  timelineEvents = await window.planAPI.loadTimeline?.(activePlan).catch(() => timelineEvents) || timelineEvents
  dismissCommentUI()
  applyCommentHighlights()
  renderReadinessStrip()
  if (activePanel === 'review') renderReviewPanel()
  showToast('Comment added')
}

function annotationClass(type) {
  return `annotation-${String(type || 'comment').replace(/[^a-z_]/g, '')}`
}

function highlightQuote(root, text, id, type = 'comment') {
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
    mark.className = `comment-mark ${annotationClass(type)}`
    mark.dataset.id = id
    try { range.surroundContents(mark) } catch (_) {}
  }
}

function applyCommentHighlights() {
  docContent.innerHTML = triggerBlock() + marked.parse(stripTitle(activeContent))

  for (const c of comments) {
    highlightQuote(docContent, c.quote.substring(0, 200), c.id, c.type || 'comment')
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
  currentReview = await window.planAPI.saveReview?.(activePlan, buildReviewPayload('dismissed')).catch(() => null) || null
  timelineEvents = await window.planAPI.loadTimeline?.(activePlan).catch(() => timelineEvents) || timelineEvents
  await window.planAPI.dismissLive(activePlan)
  const plan = allPlans.find(p => p.filename === activePlan)
  if (plan) {
    plan.live = false
    plan.status = 'reviewed'
    plan.review = currentReview
  }
  liveBadge.classList.add('hidden')
  liveBar.classList.add('hidden')
  approveBtn?.classList.add('hidden')
  sendBtn.classList.add('hidden')
  renderTabs()
  renderReviewBanner()
  renderReadinessStrip()
})

// ── Review decisions ──────────────────────────────────────────────────────────

async function completeLiveReview(plan, decision, toastMessage) {
  currentReview = await window.planAPI.saveReview?.(activePlan, buildReviewPayload(decision)).catch(() => null) || null
  timelineEvents = await window.planAPI.loadTimeline?.(activePlan).catch(() => timelineEvents) || timelineEvents
  await window.planAPI.dismissLive(activePlan)
  if (plan) {
    plan.live = false
    plan.status = decision === 'approved' ? 'approved' : 'changes_requested'
    plan.review = currentReview
  }
  liveBadge.classList.add('hidden')
  liveBar.classList.add('hidden')
  approveBtn?.classList.add('hidden')
  sendBtn.classList.add('hidden')
  renderTabs()
  renderReviewBanner()
  renderReadinessStrip()
  showToast(toastMessage, 4000)
}

approveBtn?.addEventListener('click', async () => {
  const plan = allPlans.find(p => p.filename === activePlan)
  navigator.clipboard.writeText(activeContent + '\n\n---\n\nApproved. Please proceed with the implementation.').catch(() => {})
  await completeLiveReview(plan, 'approved', 'Approval copied — paste it in Claude Code')
})

sendBtn.addEventListener('click', async () => {
  const plan = allPlans.find(p => p.filename === activePlan)
  if (!comments.length) {
    showToast('Add an annotation before requesting changes', 3000)
    return
  }
  navigator.clipboard.writeText(buildFeedbackMessage()).catch(() => {})
  await completeLiveReview(plan, 'changes_requested', 'Change request copied — paste it in Claude Code')
})

// ── Live updates ──────────────────────────────────────────────────────────────

async function loadPlans() {
  allPlans = await window.planAPI.getPlans()
  indexPalettePlans()
  const prefs = await window.planAPI.getPrefs?.().catch(() => null)
  openTabs = Array.isArray(prefs?.openTabs) ? prefs.openTabs : []
  normalizeOpenTabs()
  renderTabs()
  const target = prefs?.lastPlan || await window.planAPI.getLastPlan()
  if (target) {
    const plan = planByFilename(target)
    if (plan) {
      ensureOpenTab(plan.filename)
      await openPlan(plan, { fromTab: true })
    }
  }
}

function mergePlanUpdate(previous, next) {
  if (!previous) return next || {}
  return {
    ...previous,
    ...next,
    live: previous.live || next?.live,
    comments: previous.comments || next?.comments,
    review: previous.review || next?.review,
  }
}

function schedulePlansRefresh(data = {}) {
  pendingPlanUpdate = mergePlanUpdate(pendingPlanUpdate, data)
  clearTimeout(plansRefreshTimer)
  plansRefreshTimer = setTimeout(() => {
    refreshPlansFromUpdate().catch(() => {})
  }, 180)
}

async function refreshPlansFromUpdate() {
  if (refreshInFlight) {
    schedulePlansRefresh(pendingPlanUpdate || {})
    return
  }

  refreshInFlight = true
  const data = pendingPlanUpdate || {}
  pendingPlanUpdate = null
  try {
    const prev = activePlan
    allPlans = await window.planAPI.getPlans()
    indexPalettePlans()
    renderTabs()

    const newLive = data?.live
    if (newLive && newLive !== prev) {
      const plan = planByFilename(newLive)
      if (plan) {
        ensureOpenTab(plan.filename)
        openPlan(plan, { fromTab: true })
      }
    } else if (newLive === prev && prev) {
      const content = await window.planAPI.getPlanContent(activePlan)
      if (content) {
        activeContent = content
        snapshots = await window.planAPI.getSnapshots(activePlan)
        await loadPlanReferences()
        renderContextPanel()
        if (isStepMode) exitStepMode()
        else applyCommentHighlights()
      }
    } else if (data?.comments === activePlan) {
      // A browser client saved comments — reload them
      const saved = await window.planAPI.loadComments(activePlan)
      comments = saved || []
      timelineEvents = await window.planAPI.loadTimeline?.(activePlan).catch(() => timelineEvents) || timelineEvents
      applyCommentHighlights()
      renderReadinessStrip()
      if (activePanel === 'review') renderReviewPanel()
    } else if (data?.review === activePlan) {
      currentReview = await window.planAPI.loadReview?.(activePlan).catch(() => null) || null
      timelineEvents = await window.planAPI.loadTimeline?.(activePlan).catch(() => []) || []
      renderReviewBanner()
      renderReadinessStrip()
      if (activePanel === 'review') renderReviewPanel()
    }
  } finally {
    refreshInFlight = false

    if (pendingPlanUpdate) {
      schedulePlansRefresh(pendingPlanUpdate)
    }
  }
}

window.planAPI.onPlanUpdated(data => schedulePlansRefresh(data))

loadPlans()
