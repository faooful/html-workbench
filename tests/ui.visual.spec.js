const { test, expect } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const Module = require('node:module')
const { pathToFileURL } = require('node:url')
const esbuild = require('esbuild')

const APP_URL = `${pathToFileURL(path.resolve('renderer/index.html')).href}?testApi=1`

test.beforeEach(() => {
  fs.mkdirSync('.ui-artifacts', { recursive: true })
})

test('inspector exposes only the focused repo API', async ({ page }) => {
  await page.goto(APP_URL)

  await expect.poll(() => page.evaluate(() => Boolean(window.designAPI) && !window['plan' + 'API'])).toBe(true)
  const methods = await page.evaluate(() => Object.keys(window.designAPI).sort())
  expect(methods).toEqual([
    'getComponentPreviewCandidates',
    'getLinkedRepos',
    'linkRepo',
    'renderComponentPreview',
    'scanRepoDesignInventory',
    'suggestRepoSources',
    'unlinkRepo',
  ])
})

test('default screen auto-generates a visual design-system browser', async ({ page }) => {
  await page.goto(APP_URL)

  await expect(page.locator('#repo-rail').getByText('Repos', { exact: true })).toBeVisible()
  await expect(page.getByText('Local Library')).toBeVisible()
  await expect(page.getByText('Accidental Design System')).toHaveCount(0)
  await expect(page.locator('h1', { hasText: 'accidental-design-system' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Icons in this repo.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Icons in this repo', exact: true })).toBeVisible()
  await expect(page.locator('.icon-card', { hasText: 'DatadogLogo' })).toBeVisible()
  await expect(page.locator('.icon-card svg').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Used and defined components' })).toBeVisible()
  await expect(page.locator('.component-card', { hasText: '@/src/core/components/ui/badge' })).toBeVisible()
  await expect(page.locator('.component-card').filter({ hasText: '@/src/core/components/ui/badge' }).locator('.component-title-row span')).toHaveText('Preview')
  await expect(page.frameLocator('.component-card iframe').first().getByRole('button', { name: 'Badge' })).toBeVisible()
  await expect(page.locator('.component-card', { hasText: 'Needs example' })).toBeVisible()
  await expect(page.locator('.component-card', { hasText: 'Needs interaction' })).toBeVisible()
  await expect(page.locator('.component-card', { hasText: 'DefinedOnlyCard' })).toBeVisible()
  await expect(page.locator('.component-card', { hasText: 'STORAGE_KEYS' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Rendered color values' })).toBeVisible()
  await expect(page.locator('.swatch-card', { hasText: '--brand-primary' })).toBeVisible()
  await expect(page.locator('.swatch-card', { hasText: '#5E6DD6' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Refresh$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Scan$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Scan Settings' })).toHaveCount(0)
  await expect(page.getByLabel('Markdown editor')).toHaveCount(0)
  await expect(page.getByText('Agent readiness')).toHaveCount(0)
  await expect(page.getByText('Agent packet preview')).toHaveCount(0)
  await expect(page.getByRole('radio')).toHaveCount(0)
  await page.screenshot({ path: '.ui-artifacts/visual-browser-home.png', fullPage: true })
})

test('refresh re-generates live previews swatches tokens and recipes', async ({ page }) => {
  await page.goto(APP_URL)

  await page.getByRole('button', { name: /^Refresh$/ }).click()
  await expect(page.getByText('Guide refreshed')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Used and defined components' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Icons in this repo', exact: true })).toBeVisible()
  await expect(page.locator('.icon-card', { hasText: 'DatadogLogo' })).toBeVisible()
  await expect(page.locator('.component-card', { hasText: '@/src/core/components/ui/badge' })).toBeVisible()
  await expect(page.locator('.component-card iframe').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Token names' })).toBeVisible()
  await expect(page.locator('.token-card', { hasText: '--gui-card-bg' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rendered color values' })).toBeVisible()
  await expect(page.locator('.swatch-card', { hasText: '--brand-primary' })).toBeVisible()
  await expect(page.locator('.swatch-card', { hasText: '#5E6DD6' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Repeated class recipes' })).toBeVisible()
  await expect(page.locator('.recipe-card', { hasText: 'rounded-lg border border-transparent bg-card p-4 shadow-card' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy summary' })).toHaveCount(0)
  await page.screenshot({ path: '.ui-artifacts/visual-browser-refresh.png', fullPage: true })
})

test('command search jumps to components icons colors and sections', async ({ page }) => {
  await page.goto(APP_URL)

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
  await expect(page.getByRole('dialog', { name: 'Search catalogue' })).toBeVisible()
  await page.getByPlaceholder('Search components, icons, colors...').fill('datadog')
  await expect(page.getByRole('button', { name: /Icon DatadogLogo/ })).toBeVisible()

  await page.getByPlaceholder('Search components, icons, colors...').fill('brand primary')
  await expect(page.getByRole('button', { name: /Color --brand-primary/ })).toBeVisible()

  await page.getByPlaceholder('Search components, icons, colors...').fill('components')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Search catalogue' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Used and defined components' })).toBeInViewport()
})

test('theme and icon preview contrast controls persist', async ({ page }) => {
  await page.goto(APP_URL)

  await expect(page.locator('#app')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.icon-preview').first()).toHaveAttribute('data-preview-theme', 'auto')

  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible()
  await expect.poll(() => page.locator('.icon-card h3').first().evaluate(element => getComputedStyle(element).color)).toBe('rgb(32, 32, 32)')

  await page.getByRole('button', { name: /^light$/ }).click()
  await expect(page.locator('.icon-preview').first()).toHaveAttribute('data-preview-theme', 'light')
  await expect(page.locator('.icon-preview svg').first()).toBeVisible()

  await page.getByRole('button', { name: /^dark$/ }).click()
  await expect(page.locator('.icon-preview').first()).toHaveAttribute('data-preview-theme', 'dark')

  await page.getByRole('button', { name: /^checker$/ }).click()
  await expect(page.locator('.icon-preview').first()).toHaveAttribute('data-preview-theme', 'checker')

  await page.reload()
  await expect(page.locator('#app')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('.icon-preview').first()).toHaveAttribute('data-preview-theme', 'checker')
})

test('switching repos auto-generates repo-specific previews and tokens', async ({ page }) => {
  await page.goto(APP_URL)

  await page.getByRole('button', { name: 'Link repo' }).click()
  await expect(page.locator('#repo-rail').getByRole('button', { name: /R bits/ })).toBeVisible()
  await expect(page.getByText('/mock/bits')).toBeVisible()

  await page.locator('#repo-rail').getByRole('button', { name: /web-ui/ }).click()
  await expect(page.locator('h1', { hasText: 'web-ui' })).toBeVisible()
  await expect(page.locator('.icon-card', { hasText: 'SettingsIcon' })).toBeVisible()
  await expect(page.locator('.component-card', { hasText: '@/components/Button' })).toBeVisible()
  await expect(page.locator('.token-card', { hasText: '--brand-primary' })).toBeVisible()
  await expect(page.getByText('Badge from @/src/core/components/ui/badge')).toHaveCount(0)
})

test('graph-first scanner expands design roots and preserves row contracts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-graph-scan-'))
  fs.mkdirSync(path.join(root, 'src/components'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src/pages'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src/styles'), { recursive: true })
  fs.mkdirSync(path.join(root, 'packages/ui/src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture-root', workspaces: ['packages/ui'] }), 'utf8')
  fs.writeFileSync(path.join(root, 'packages/ui/package.json'), JSON.stringify({
    name: '@fixture/ui',
    exports: { './Button': './src/Button.tsx' },
  }), 'utf8')
  fs.writeFileSync(path.join(root, 'src/styles/theme.css'), ':root { --brand-primary: #336699; }\n', 'utf8')
  fs.writeFileSync(path.join(root, 'src/components/Button.tsx'), `
import '../styles/theme.css'
export function Button() {
  return <button className="rounded-md bg-brand text-white">Button</button>
}
`, 'utf8')
  fs.writeFileSync(path.join(root, 'src/components/UnusedCard.tsx'), `
export function UnusedCard() {
  return <section className="rounded-md border border-slate-200">Unused</section>
}
`, 'utf8')
  fs.writeFileSync(path.join(root, 'packages/ui/src/Button.tsx'), `
export function PackageButton() {
  return <button className="px-2 py-1">Package</button>
}
`, 'utf8')
  fs.writeFileSync(path.join(root, 'src/pages/Home.tsx'), `
import { Button } from '../components/Button'
import { PackageButton } from '@fixture/ui/Button'
export function Home() {
  return <main><Button /><PackageButton /></main>
}
`, 'utf8')
  fs.writeFileSync(path.join(root, 'src/pages/Home.test.tsx'), `
import { Button } from '../components/Button'
export function TestOnly() {
  return <Button />
}
`, 'utf8')

  const originalLoad = Module._load
  Module._load = function mockedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: { getPath: () => path.join(root, '.app-data'), whenReady: () => ({ then: () => {} }), on: () => {}, quit: () => {} },
        BrowserWindow: class { static getAllWindows() { return [] } loadFile() {} },
        dialog: {},
        ipcMain: { handle: () => {} },
      }
    }
    return originalLoad.apply(this, arguments)
  }

  try {
    const mainSource = fs.readFileSync(path.resolve('main.js'), 'utf8')
    const loadScannerHelpers = Function('require', '__dirname', 'module', 'exports', `${mainSource}; return { buildRepoFileIndex, extractRepoEdges, selectDesignGraph, extractDesignFacts, sourceMapHealth, normalizeColorValue };`)
    const helpers = loadScannerHelpers(require, path.resolve('.'), { exports: {} }, {})
    const repo = { id: 'fixture', name: 'fixture', path: root }
    const fileIndex = helpers.buildRepoFileIndex(repo)
    const edges = helpers.extractRepoEdges(repo, fileIndex)
    const sourceMap = {
      anchors: [
        { path: 'src/components/Button.tsx', selected: true },
        { path: 'src/components/UnusedCard.tsx', selected: true },
        { path: 'packages/ui/src/Button.tsx', selected: true },
        { path: 'src/styles/theme.css', selected: true },
      ],
    }
    const graph = helpers.selectDesignGraph(repo, fileIndex, edges, sourceMap)
    const facts = helpers.extractDesignFacts(repo, graph)
    const health = helpers.sourceMapHealth(graph.sourceMap, graph.paths, graph)

    expect(graph.paths).toContain('src/pages/Home.tsx')
    expect(graph.paths).toContain('src/styles/theme.css')
    expect(facts.cssVariables.map(item => item.value)).toContain('--brand-primary')
    expect(facts.colors.map(item => item.value)).toContain('#336699')
    expect(helpers.normalizeColorValue('#FFF')).toBe('#ffffff')
    expect(helpers.normalizeColorValue('#FEF3C7')).toBe('#fef3c7')

    const button = facts.componentImports.find(item => item.name === 'Button' && item.sourceFile === 'src/components/Button.tsx')
    expect(button).toMatchObject({
      count: 1,
      importPath: '../components/Button',
      previewable: true,
      unresolved: false,
    })
    expect(button.files).toEqual(['src/pages/Home.tsx'])

    const packageButton = facts.componentImports.find(item => item.name === 'PackageButton')
    expect(packageButton?.sourceFile).toBe('packages/ui/src/Button.tsx')

    const unused = facts.componentImports.find(item => item.name === 'UnusedCard')
    expect(unused).toMatchObject({ count: 0, sourceFile: 'src/components/UnusedCard.tsx' })
    expect(facts.inventoryRows.find(row => row.type === 'Component' && row.name === 'Button')?.metadata).toMatchObject({
      sourceFile: 'src/components/Button.tsx',
      previewable: true,
      unresolved: false,
    })
    expect(health.warnings).not.toContain('No component root was found in the graph.')

    const withoutTheme = helpers.selectDesignGraph(repo, fileIndex, edges, {
      anchors: [
        { path: 'src/components/Button.tsx', selected: true },
        { path: 'src/styles/theme.css', selected: false },
      ],
    })
    expect(withoutTheme.paths).not.toContain('src/styles/theme.css')
    expect(helpers.extractDesignFacts(repo, withoutTheme).cssVariables.map(item => item.value)).not.toContain('--brand-primary')
  } finally {
    Module._load = originalLoad
  }
})

test('svg icon previews strip document-leaking styles', async () => {
  const originalLoad = Module._load
  Module._load = function mockedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: { getPath: () => '/tmp', whenReady: () => ({ then: () => {} }), on: () => {}, quit: () => {} },
        BrowserWindow: class { static getAllWindows() { return [] } loadFile() {} },
        dialog: {},
        ipcMain: { handle: () => {} },
      }
    }
    return originalLoad.apply(this, arguments)
  }

  try {
    const mainSource = fs.readFileSync(path.resolve('main.js'), 'utf8')
    const loadSvgHelpers = Function('require', '__dirname', 'module', 'exports', `${mainSource}; return { validSvgMarkup };`)
    const { validSvgMarkup } = loadSvgHelpers(require, path.resolve('.'), { exports: {} }, {})
    const svg = validSvgMarkup('<svg viewBox="0 0 10 10"><style>svg{color:#ff00aa}.repo-row{color:#ff00aa}</style><path d="M0 0h10v10z"/></svg>')

    expect(svg).toContain('<svg')
    expect(svg).toContain('<path')
    expect(svg).not.toContain('<style')
    expect(svg).not.toContain('.repo-row')
    expect(svg).not.toContain('#ff00aa')
  } finally {
    Module._load = originalLoad
  }
})

test('preview shell includes utility styles for tailwind component classes', async () => {
  const originalLoad = Module._load
  Module._load = function mockedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: { getPath: () => '/tmp', whenReady: () => ({ then: () => {} }), on: () => {}, quit: () => {} },
        BrowserWindow: class { static getAllWindows() { return [] } loadFile() {} },
        dialog: {},
        ipcMain: { handle: () => {} },
      }
    }
    return originalLoad.apply(this, arguments)
  }

  try {
    const mainSource = fs.readFileSync(path.resolve('main.js'), 'utf8')
    const loadPreviewHelpers = Function('require', '__dirname', 'module', 'exports', `${mainSource}; return { previewUtilityCss };`)
    const { previewUtilityCss } = loadPreviewHelpers(require, path.resolve('.'), { exports: {} }, {})
    const css = previewUtilityCss()

    expect(css).toContain('.bg-primary')
    expect(css).toContain('.text-primary-foreground')
    expect(css).toContain('.h-9')
    expect(css).toContain('[data-slot="button"]')
  } finally {
    Module._load = originalLoad
  }
})

test('narrow viewport keeps the visual browser understandable', async ({ page }) => {
  await page.setViewportSize({ width: 880, height: 760 })
  await page.goto(APP_URL)

  await expect.poll(() => page.locator('#repo-rail').evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
  await expect(page.getByText('Local Library')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Icons in this repo.' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Refresh$/ })).toBeVisible()
  await page.screenshot({ path: '.ui-artifacts/visual-browser-narrow.png', fullPage: true })
})

test('component preview builder handles docs examples globals imports and styles', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-fixture-'))
  const pkgDir = path.join(root, 'packages/ui')
  fs.mkdirSync(pkgDir, { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture-root', workspaces: ['packages/ui'] }), 'utf8')
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
    name: '@fixture/ui',
    exports: {
      './Example': './Example.tsx',
      './DottedBackground': './DottedBackground.tsx',
    },
    imports: {
      '#helper': './helper.ts',
      '#style': './style.module.css',
    },
  }), 'utf8')
  fs.writeFileSync(path.join(pkgDir, 'helper.ts'), 'export const helperLabel = IS_PROD ? "prod" : "dev";\n', 'utf8')
  fs.writeFileSync(path.join(pkgDir, 'base.module.css'), '.Base { border-radius: 6px; }\n', 'utf8')
  fs.writeFileSync(path.join(pkgDir, 'style.module.css'), '.Root { composes: Base from "./base.module.css"; --local-color: --light-dark(env(--preview-light), env(--preview-dark)); color: var(--local-color); &.isActive { background: var(--external-color from global, white); } }\n', 'utf8')
  fs.writeFileSync(path.join(pkgDir, 'tokens.less'), '@preview-blue: blue;\n', 'utf8')
  fs.writeFileSync(path.join(pkgDir, 'example.less'), '@import (reference) "@fixture/ui/tokens.less"; .fixture-less { color: @preview-blue; }\n', 'utf8')
  fs.writeFileSync(path.join(pkgDir, 'DottedBackground.tsx'), 'import React from "react"; import "./example.less"; export function DottedBackground({ children }) { return <div className="fixture-bg">{children}</div> }\n', 'utf8')
  fs.writeFileSync(path.join(pkgDir, 'Example.tsx'), 'import React from "react"; import { helperLabel } from "#helper"; import styles from "#style"; import "./example.less"; export function Example({ label = helperLabel }) { return <button className={styles.Root}>{label}</button> }\n', 'utf8')
  fs.writeFileSync(path.join(pkgDir, 'example.mdx'), 'import { DottedBackground } from "@fixture/ui/DottedBackground";\nimport { Example } from "@fixture/ui/Example";\n\n<DottedBackground>\n  <Example label="Docs example" />\n</DottedBackground>\n', 'utf8')

  const originalLoad = Module._load
  Module._load = function mockedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: { getPath: () => path.join(root, '.app-data'), whenReady: () => ({ then: () => {} }), on: () => {}, quit: () => {} },
        BrowserWindow: class { static getAllWindows() { return [] } loadFile() {} },
        dialog: {},
        ipcMain: { handle: () => {} },
      }
    }
    return originalLoad.apply(this, arguments)
  }

  try {
    const mainSource = fs.readFileSync(path.resolve('main.js'), 'utf8')
    const loadPreviewHelpers = Function('require', '__dirname', 'module', 'exports', `${mainSource}; return { resolveLocalImport, previewEntrySource, collectNodePaths, previewAssetQueryPlugin, previewResolvePlugin, previewCssModulePlugin, previewLessPlugin, previewScssPlugin, nodeBuiltinShim };`)
    const helpers = loadPreviewHelpers(require, path.resolve('.'), { exports: {} }, {})
    const repo = { id: 'fixture', name: 'fixture', path: root }
    const row = {
      id: 'Component-Example',
      name: 'Example',
      files: ['src/App.tsx'],
      metadata: {
        importPath: '@fixture/ui/Example',
        sourceFile: 'packages/ui/Example.tsx',
        definitionFiles: ['packages/ui/Example.tsx'],
        previewable: true,
      },
    }
    const resolved = helpers.resolveLocalImport(repo, row)
    const preview = helpers.previewEntrySource(repo, row, resolved.specifier)
    const outdir = path.join(root, 'out')
    fs.mkdirSync(outdir)
    const entry = path.join(outdir, 'entry.jsx')
    fs.writeFileSync(entry, preview.source, 'utf8')
    await esbuild.build({
      entryPoints: [entry],
      outfile: path.join(outdir, 'preview.js'),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      jsx: 'automatic',
      absWorkingDir: root,
      nodePaths: helpers.collectNodePaths(repo),
      plugins: [
        helpers.previewAssetQueryPlugin(repo),
        helpers.previewResolvePlugin(repo),
        helpers.previewCssModulePlugin(repo),
        helpers.previewLessPlugin(repo),
      ],
      define: {
        'process.env.NODE_ENV': '"development"',
        IS_PROD: 'false',
        IS_DEV: 'true',
        IS_TEST: 'false',
      },
      loader: { '.css': 'css', '.less': 'css', '.svg': 'dataurl' },
      logLevel: 'silent',
    })
    const bundledJs = fs.readFileSync(path.join(outdir, 'preview.js'), 'utf8')
    expect(preview.sourceType).toBe('docs')
    expect(preview.source).toContain('Docs example')
    expect(bundledJs).not.toMatch(/\bIS_PROD\b|\bIS_DEV\b|\bIS_TEST\b/)
    expect(bundledJs).toMatch(/border-radius:\s*6px/)
    expect(bundledJs).toMatch(/var\(--LIGHT/)
    const cssModuleLiteral = bundledJs.match(/var css = "([^"]+)"/)?.[1] || ''
    expect(cssModuleLiteral).not.toMatch(/from global|--light-dark\\?\(|env\\?\(--/)
    expect(fs.existsSync(path.join(outdir, 'preview.css'))).toBe(true)
    const bundledCss = fs.readFileSync(path.join(outdir, 'preview.css'), 'utf8')
    expect(bundledCss).toMatch(/color:\s*blue/)
  } finally {
    Module._load = originalLoad
  }
})

test('node built-in shims are syntactically valid ESM', async () => {
  const originalLoad = Module._load
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => '/tmp', whenReady: () => ({ then: () => {} }), on: () => {}, quit: () => {} }, BrowserWindow: class {}, dialog: {}, ipcMain: { handle: () => {} } }
    return originalLoad.apply(this, arguments)
  }
  let nodeBuiltinShim
  try {
    const mainSource = fs.readFileSync(path.resolve('main.js'), 'utf8')
    const loader = Function('require', '__dirname', 'module', 'exports', `${mainSource}; return { nodeBuiltinShim };`)
    ;({ nodeBuiltinShim } = loader(require, path.resolve('.'), { exports: {} }, {}))
  } finally {
    Module._load = originalLoad
  }

  const builtinNames = require('module').builtinModules.filter(m => !m.startsWith('_'))
  const errors = []
  for (const name of builtinNames) {
    const code = nodeBuiltinShim(name)
    try {
      await esbuild.transform(code, { format: 'esm', loader: 'js' })
    } catch (e) {
      errors.push(`${name}: ${String(e.message || e).split('\n')[0]}`)
    }
  }
  expect(errors).toEqual([])
})

test('preview builder resolves node built-in named imports without build errors', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-node-imports-'))
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture-node-imports' }), 'utf8')
  fs.writeFileSync(path.join(root, 'src/Component.tsx'), `
import React from 'react'
import { env, cwd, platform } from 'process'
import { EventEmitter } from 'events'
import { Readable } from 'stream'
import pathMod from 'path'
import { ok } from 'assert'
export function Component() {
  const em = new EventEmitter()
  em.on('x', () => {})
  return <div data-env={env.NODE_ENV} data-cwd={cwd()} data-platform={platform}>{pathMod.join('a', 'b')}</div>
}
`, 'utf8')

  const originalLoad = Module._load
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => path.join(root, '.app-data'), whenReady: () => ({ then: () => {} }), on: () => {}, quit: () => {} }, BrowserWindow: class { static getAllWindows() { return [] } loadFile() {} }, dialog: {}, ipcMain: { handle: () => {} } }
    return originalLoad.apply(this, arguments)
  }
  try {
    const mainSource = fs.readFileSync(path.resolve('main.js'), 'utf8')
    const loader = Function('require', '__dirname', 'module', 'exports', `${mainSource}; return { previewAssetQueryPlugin, previewResolvePlugin, previewCssModulePlugin, previewLessPlugin, previewScssPlugin };`)
    const helpers = loader(require, path.resolve('.'), { exports: {} }, {})
    const repo = { id: 'fixture-node', name: 'fixture-node', path: root }

    const outdir = path.join(root, 'out')
    fs.mkdirSync(outdir)
    const result = await esbuild.build({
      entryPoints: [path.join(root, 'src/Component.tsx')],
      outfile: path.join(outdir, 'preview.js'),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      jsx: 'automatic',
      absWorkingDir: root,
      plugins: [helpers.previewAssetQueryPlugin(repo), helpers.previewResolvePlugin(repo), helpers.previewCssModulePlugin(repo), helpers.previewScssPlugin(repo), helpers.previewLessPlugin(repo)],
      define: { 'process.env.NODE_ENV': '"development"', 'global': 'globalThis', '__dirname': '"/"', '__filename': '"/index.js"' },
      loader: { '.css': 'css' },
      logLevel: 'silent',
    })
    expect(result.errors).toHaveLength(0)
    const bundle = fs.readFileSync(path.join(outdir, 'preview.js'), 'utf8')
    // Shims should be inlined — no bare node: imports left in the bundle
    expect(bundle).not.toMatch(/from ['"]node:/)
    expect(bundle).not.toMatch(/require\(['"]process['"]\)/)
  } finally {
    Module._load = originalLoad
  }
})
