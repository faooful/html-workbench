const { test, expect } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const APP_URL = `${pathToFileURL(path.resolve('renderer/index.html')).href}?testApi=1`

test.beforeEach(() => {
  fs.mkdirSync('.ui-artifacts', { recursive: true })
})

test('desktop harness renders the split design.md editor', async ({ page }) => {
  await page.goto(APP_URL)
  await expect.poll(() => page.evaluate(() => Boolean(window.designAPI) && !window['plan' + 'API'])).toBe(true)
  await expect(page.getByText('Projects')).toBeVisible()
  await expect(page.getByLabel('Markdown editor')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Document', exact: true })).toBeVisible()
  await expect(page.locator('#document-preview').getByRole('heading', { name: 'DESIGN.md Workbench Design Language' })).toBeVisible()
  await page.getByLabel('Markdown editor').evaluate(el => {
    el.scrollTop = el.scrollHeight
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await expect.poll(() => page.locator('#preview-scroll').evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  await page.screenshot({ path: '.ui-artifacts/workspace.png', fullPage: true })
})

test('preview parses tokens and components from markdown conventions', async ({ page }) => {
  await page.goto(APP_URL)

  await page.getByRole('tab', { name: 'Tokens' }).click()
  await expect(page.locator('#tokens-preview .preview-section-title', { hasText: 'Colors' })).toBeVisible()
  await expect(page.locator('#tokens-preview code', { hasText: '#5E6DD6' })).toBeVisible()
  await page.screenshot({ path: '.ui-artifacts/tokens.png', fullPage: true })

  await page.getByRole('tab', { name: 'Components' }).click()
  await expect(page.locator('#components-preview')).toContainText('From DESIGN.md contract')
  await expect(page.locator('#components-preview').getByRole('heading', { name: 'Button' })).toBeVisible()
  await expect(page.locator('#components-preview').getByRole('button', { name: 'Primary' })).toBeVisible()
  await expect(page.locator('#components-preview').getByText('YAML source').first()).toBeVisible()
  await expect(page.locator('#preview-scroll')).toHaveJSProperty('scrollLeft', 0)
  const componentsOverflow = await page.locator('#preview-scroll').evaluate(el => el.scrollWidth - el.clientWidth)
  expect(componentsOverflow).toBeLessThanOrEqual(1)
  await page.screenshot({ path: '.ui-artifacts/components.png', fullPage: true })

  await page.getByRole('tab', { name: 'Issues' }).click()
  await expect(page.locator('#issues-preview')).toContainText(/No blocking issues|issue/)
  await page.screenshot({ path: '.ui-artifacts/issues.png', fullPage: true })
})

test('editing, pane modes, theme toggle, and command palette work', async ({ page }) => {
  await page.goto(APP_URL)

  const editor = page.getByLabel('Markdown editor')
  await editor.fill('---\nversion: alpha\nname: Changed Design\ncolors:\n  primary: "#FF3366"\ntypography:\n  body-md:\n    fontFamily: Geist\n    fontSize: 15px\n    fontWeight: 400\n    lineHeight: 1.6\ncomponents:\n  button-primary:\n    backgroundColor: "{colors.primary}"\n    textColor: "#ffffff"\n---\n\n# Changed Design\n\n## Overview\n\nA stricter contract.\n')
  await expect(page.locator('#document-preview').getByRole('heading', { name: 'Changed Design' })).toBeVisible()

  await page.getByRole('button', { name: 'Expand preview' }).click()
  await expect(editor).toBeHidden()
  await expect(page.getByRole('button', { name: 'Return to split view' })).toBeVisible()
  await page.screenshot({ path: '.ui-artifacts/preview-full.png', fullPage: true })
  await page.getByRole('button', { name: 'Return to split view' }).click()
  await expect(editor).toBeVisible()

  await page.getByRole('button', { name: 'Expand editor' }).click()
  await expect(page.locator('#preview-scroll')).toHaveCount(0)
  await page.getByRole('button', { name: 'Return to split view' }).click()
  await expect(page.locator('#preview-scroll')).toBeVisible()

  await page.getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('#app')).toHaveAttribute('data-theme', 'light')
  await page.screenshot({ path: '.ui-artifacts/light-theme.png', fullPage: true })

  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Copy token JSON' }).click()
  await expect(page.getByText('Token JSON copied')).toBeVisible()

  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Copy path' }).click()
  await expect(page.getByText('Path copied')).toBeVisible()

  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Copy agent prompt' }).click()
  await expect(page.getByText('Agent prompt copied')).toBeVisible()

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
  await expect(page.getByPlaceholder('Open file or run action…')).toBeVisible()
  await page.screenshot({ path: '.ui-artifacts/palette.png', fullPage: true })
  await page.getByText('Insert Layout guidance').click()
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue(/## Layout Guidance/)

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
  await page.getByText('Expand preview').click()
  await expect(editor).toBeHidden()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
  await page.getByText('Show split view').click()
  await expect(editor).toBeVisible()
})

test('YAML starter blocks merge into front matter instead of markdown body', async ({ page }) => {
  await page.goto(APP_URL)

  const editor = page.getByLabel('Markdown editor')
  await editor.fill('# Draft Document\n\n## Purpose\n\nA prose draft.\n')

  await page.getByRole('button', { name: 'Insert block' }).click()
  await page.getByRole('menuitem', { name: 'Insert Typography' }).click()

  await expect(editor).toHaveValue(/^---\ntypography:/)
  await page.getByRole('tab', { name: 'Tokens' }).click()
  await expect(page.locator('#tokens-preview .preview-section-title', { hasText: 'Typography' })).toBeVisible()
  await expect(page.locator('#tokens-preview')).toContainText('title-lg')
  await expect(page.locator('#document-preview')).toHaveCount(0)

  await page.getByRole('tab', { name: 'Document' }).click()
  await expect(page.locator('#document-preview')).not.toContainText('typography:')
  await expect(page.locator('#document-preview').getByRole('heading', { name: 'Draft Document' })).toBeVisible()
})

test('component playground groups families and updates from live YAML edits', async ({ page }) => {
  await page.goto(APP_URL)

  const editor = page.getByLabel('Markdown editor')
  await editor.fill('---\nversion: alpha\nname: Playground Contract\ncolors:\n  primary: "#1166FF"\n  primary-hover: "#0B4FCC"\n  danger: "#FF4455"\n  text: "#FFFFFF"\n  surface: "#20232B"\n  panel: "#262A33"\nrounded:\n  sm: 6px\n  md: 10px\nspacing:\n  md: 16px\ncomponents:\n  button-primary:\n    backgroundColor: "{colors.primary}"\n    textColor: "{colors.text}"\n    rounded: "{rounded.sm}"\n    height: 34px\n    padding: "0 14px"\n  button-secondary:\n    backgroundColor: "{colors.surface}"\n    textColor: "{colors.text}"\n    rounded: "{rounded.sm}"\n  button-primary-hover:\n    backgroundColor: "{colors.primary-hover}"\n    textColor: "{colors.text}"\n  button-danger:\n    backgroundColor: "{colors.danger}"\n    textColor: "{colors.text}"\n  input-field:\n    backgroundColor: "{colors.surface}"\n    textColor: "{colors.text}"\n    rounded: "{rounded.sm}"\n    padding: 8px\n  input-error:\n    backgroundColor: "{colors.surface}"\n    textColor: "{colors.text}"\n    borderColor: "{colors.danger}"\n  card-panel:\n    backgroundColor: "{colors.panel}"\n    textColor: "{colors.text}"\n    rounded: "{rounded.md}"\n    padding: "{spacing.md}"\n  modal-dialog:\n    backgroundColor: "{colors.panel}"\n    textColor: "{colors.text}"\n    rounded: "{rounded.md}"\n  toolbar-main:\n    backgroundColor: "{colors.surface}"\n    textColor: "{colors.text}"\n  sidebar-main:\n    backgroundColor: "{colors.surface}"\n    textColor: "{colors.text}"\n  table-default:\n    backgroundColor: "{colors.surface}"\n    textColor: "{colors.text}"\n  toast-success:\n    backgroundColor: "{colors.panel}"\n    textColor: "{colors.text}"\n  avatar-chip:\n    backgroundColor: "{colors.panel}"\n    textColor: "{colors.text}"\n---\n\n# Playground Contract\n')

  await page.getByRole('tab', { name: 'Components' }).click()
  await expect(page.locator('#components-preview').getByRole('heading', { name: 'Button' })).toBeVisible()
  await expect(page.locator('#components-preview').getByRole('button', { name: 'Secondary' })).toBeVisible()
  await expect(page.locator('#components-preview').getByRole('heading', { name: 'Input' })).toBeVisible()
  await expect(page.locator('#components-preview').getByText('With value')).toBeVisible()
  await expect(page.locator('#components-preview').getByRole('heading', { name: 'Card' })).toBeVisible()
  await expect(page.locator('#components-preview').getByRole('heading', { name: 'Modal' })).toBeVisible()
  await expect(page.locator('#components-preview').getByRole('heading', { name: 'Toolbar' })).toBeVisible()
  await expect(page.locator('#components-preview').getByRole('heading', { name: 'Sidebar' })).toBeVisible()
  await expect(page.locator('#components-preview').getByRole('heading', { name: 'Table' })).toBeVisible()
  await expect(page.locator('#components-preview').getByRole('heading', { name: 'Toast' })).toBeVisible()
  await expect(page.locator('#components-preview')).toContainText('Generic contract preview')

  const button = page.locator('.playground-family[data-family="button"] .playground-canvas .contract-button').first()
  await expect(button).toHaveCSS('background-color', 'rgb(17, 102, 255)')

  await editor.fill('---\nversion: alpha\nname: Playground Contract\ncolors:\n  primary: "#22CC88"\n  text: "#FFFFFF"\nrounded:\n  sm: 6px\ncomponents:\n  button-primary:\n    backgroundColor: "{colors.primary}"\n    textColor: "{colors.text}"\n    rounded: "{rounded.sm}"\n  card-panel:\n    backgroundColor: "{colors.missing}"\n---\n\n# Playground Contract\n')
  await expect(button).toHaveCSS('background-color', 'rgb(34, 204, 136)')
  await expect(page.locator('#components-preview')).toContainText('colors.missing')
})

test('component playground explains empty component contracts', async ({ page }) => {
  await page.goto(APP_URL)
  await page.getByLabel('Markdown editor').fill('---\nversion: alpha\nname: Empty Contract\ncolors:\n  primary: "#5E6DD6"\n---\n\n# Empty Contract\n')
  await page.getByRole('tab', { name: 'Components' }).click()
  await expect(page.locator('#components-preview')).toContainText('No components in this file')
  await expect(page.locator('#components-preview')).toContainText('button-primary')

  await page.getByLabel('Markdown editor').fill('# Prose Components\n\n## Components\n\n### Alert Banner\n\nUsed for important notices.\n')
  await expect(page.locator('#components-preview')).toContainText('Inferred from prose')
})

test('component tab treats flat sibling design files as separate contracts', async ({ page }) => {
  await page.goto(APP_URL)

  await page.getByText('Bits Chat & Workspace').click()
  await expect(page.locator('#document-preview').getByRole('heading', { name: 'Bits Chat & Workspace' })).toBeVisible()

  await page.getByRole('tab', { name: 'Components' }).click()
  await expect(page.locator('#components-preview')).toContainText('Project component contract')
  await expect(page.locator('#components-preview')).toContainText('Bits Primitive Components')

  await page.locator('#components-preview').getByRole('button', { name: /Bits Primitive Components/ }).click()
  await expect(page.locator('#components-preview')).toContainText('From DESIGN.md contract')
  await expect(page.locator('#components-preview').getByRole('heading', { name: 'Button' })).toBeVisible()
  await expect(page.locator('#components-preview')).toContainText('@bits/gui/core/components/ui/button')
})

test('can link an external design folder without copying files', async ({ page }) => {
  await page.goto(APP_URL)

  await page.getByRole('button', { name: 'Link design folder' }).click()
  await expect(page.getByText('External Tokens')).toBeVisible()
  await expect(page.getByText('tokens.md')).toBeVisible()

  await page.getByText('External Tokens').click()
  await expect(page.locator('#document-preview').getByRole('heading', { name: 'External Tokens' })).toBeVisible()
  await page.getByRole('button', { name: 'More actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Link folder…' })).toBeVisible()
})

test('local vault can create, rename, delete, and save docs', async ({ page }) => {
  await page.goto(APP_URL)

  const dialogAnswers = ['test-project/components/sidebar/DESIGN.md', true]
  page.on('dialog', async dialog => {
    const answer = dialogAnswers.shift()
    if (answer === true) {
      await dialog.accept()
      return
    }
    await dialog.accept(answer || '')
  })

  await page.getByRole('button', { name: 'New design.md' }).click()
  await expect(page.getByRole('dialog', { name: 'Create DESIGN.md' })).toBeVisible()
  await page.getByLabel('Document path').fill('components/table/DESIGN.md')
  await page.getByLabel('Project folder').fill('test-project')
  await page.getByRole('button', { name: 'Create file' }).click()
  await expect(page.getByText('Table Design').first()).toBeVisible()
  await expect(page.getByText('test-project/components/table/DESIGN.md')).toBeVisible()

  await page.getByLabel('Markdown editor').fill('# Saved Pattern Library\n\n## Tokens\n\n- Accent: #00AA88\n')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved').first()).toBeVisible()

  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Rename document' }).click()
  await expect(page.getByText('test-project/components/sidebar/DESIGN.md')).toBeVisible()

  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete document' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('test-project/components/sidebar/DESIGN.md')).toHaveCount(0)
})

test('narrow viewport keeps the editor usable', async ({ page }) => {
  await page.setViewportSize({ width: 880, height: 760 })
  await page.goto(APP_URL)
  await expect(page.getByLabel('Markdown editor')).toBeVisible()
  await expect(page.locator('#vault-rail')).toBeHidden()
  await page.screenshot({ path: '.ui-artifacts/narrow.png', fullPage: true })
})

test('components preview reflows without horizontal overflow in split mode', async ({ page }) => {
  await page.setViewportSize({ width: 1240, height: 760 })
  await page.goto(APP_URL)
  await page.getByRole('tab', { name: 'Components' }).click()
  await expect(page.locator('.playground-family[data-family="button"]')).toBeVisible()
  const overflow = await page.locator('#preview-scroll').evaluate(el => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  const tabOverflow = await page.locator('.preview-segmented-tabs').evaluate(el => el.scrollWidth - el.clientWidth)
  expect(tabOverflow).toBeLessThanOrEqual(1)
  await page.screenshot({ path: '.ui-artifacts/components-responsive.png', fullPage: true })
})
