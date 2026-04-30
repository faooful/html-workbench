const { test, expect } = require('@playwright/test')
const fs = require('node:fs')

test.beforeEach(() => {
  fs.mkdirSync('.ui-artifacts', { recursive: true })
})

test('desktop harness renders the split design.md editor', async ({ page }) => {
  await page.goto('/__desktop-test')
  await expect(page.getByText('Projects')).toBeVisible()
  await expect(page.getByLabel('Markdown editor')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Document', exact: true })).toBeVisible()
  await expect(page.locator('#document-preview').getByRole('heading', { name: 'Product Design Language' })).toBeVisible()
  await page.screenshot({ path: '.ui-artifacts/workspace.png', fullPage: true })
})

test('preview parses tokens and components from markdown conventions', async ({ page }) => {
  await page.goto('/__desktop-test')

  await page.getByRole('button', { name: 'Tokens' }).click()
  await expect(page.locator('#tokens-preview .preview-section-title', { hasText: 'Colors' })).toBeVisible()
  await expect(page.locator('#tokens-preview code', { hasText: '#5E6DD6' })).toBeVisible()
  await page.screenshot({ path: '.ui-artifacts/tokens.png', fullPage: true })

  await page.getByRole('button', { name: 'Components' }).click()
  await expect(page.getByRole('heading', { name: 'Button Primary' })).toBeVisible()
  await expect(page.locator('#components-preview').getByRole('button', { name: 'Button' })).toBeVisible()
  await page.screenshot({ path: '.ui-artifacts/components.png', fullPage: true })

  await page.getByRole('button', { name: 'Issues' }).click()
  await expect(page.locator('#issues-preview')).toContainText(/No blocking issues|issue/)
  await page.screenshot({ path: '.ui-artifacts/issues.png', fullPage: true })
})

test('editing, pane modes, theme toggle, and command palette work', async ({ page }) => {
  await page.goto('/__desktop-test')

  const editor = page.getByLabel('Markdown editor')
  await editor.fill('---\nversion: alpha\nname: Changed Design\ncolors:\n  primary: "#FF3366"\ntypography:\n  body-md:\n    fontFamily: Geist\n    fontSize: 15px\n    fontWeight: 400\n    lineHeight: 1.6\ncomponents:\n  button-primary:\n    backgroundColor: "{colors.primary}"\n    textColor: "#ffffff"\n---\n\n# Changed Design\n\n## Overview\n\nA stricter contract.\n')
  await expect(page.locator('#document-preview').getByRole('heading', { name: 'Changed Design' })).toBeVisible()

  await page.getByRole('button', { name: 'Preview fullscreen' }).click()
  await expect(editor).toBeHidden()
  await page.screenshot({ path: '.ui-artifacts/preview-full.png', fullPage: true })
  await page.getByRole('button', { name: 'Preview fullscreen' }).click()

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
})

test('local vault can create, rename, delete, and save docs', async ({ page }) => {
  await page.goto('/__desktop-test')

  const dialogAnswers = ['test-project/renamed-design.md', true]
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
  await page.getByLabel('Document name').fill('Test Pattern Library')
  await page.getByLabel('Project folder').fill('test-project')
  await page.getByRole('button', { name: 'Create file' }).click()
  await expect(page.getByText('Test Pattern Library').first()).toBeVisible()

  await page.getByLabel('Markdown editor').fill('# Saved Pattern Library\n\n## Tokens\n\n- Accent: #00AA88\n')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved').first()).toBeVisible()

  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Rename document' }).click()
  await expect(page.getByText('test-project/renamed-design.md')).toBeVisible()

  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete document' }).click()
  await expect(page.getByText('test-project/renamed-design.md')).toHaveCount(0)
})

test('narrow viewport keeps the editor usable', async ({ page }) => {
  await page.setViewportSize({ width: 880, height: 760 })
  await page.goto('/__desktop-test')
  await expect(page.getByLabel('Markdown editor')).toBeVisible()
  await expect(page.locator('#vault-rail')).toBeHidden()
  await page.screenshot({ path: '.ui-artifacts/narrow.png', fullPage: true })
})
