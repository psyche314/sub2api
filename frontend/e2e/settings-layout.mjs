/**
 * Browser regression coverage for the real admin pages, with isolated API fixtures.
 * Run a Vite server, then: E2E_BASE_URL=http://127.0.0.1:3001 pnpm test:e2e:settings
 * Windows uses installed Edge; other hosts use Playwright Chromium.
 */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3001'
const output = process.env.E2E_SCREENSHOT_DIR
if (output) await mkdir(output, { recursive: true })
const user = {
  id: 1, username: 'UI reviewer', email: 'review@example.test', role: 'admin',
  status: 'active', balance: 0, concurrency: 10, allowed_groups: [], created_at: '2026-01-01T00:00:00Z',
}
const models = Array.from({ length: 120 }, (_, i) => 'gpt-review-model-' + String(i + 1).padStart(3, '0'))
const group = {
  id: 1, name: 'OpenAI review group', platform: 'openai', status: 'active',
  rate_multiplier: 1, subscription_type: 'standard', is_exclusive: false, account_count: 1,
}
const account = {
  id: 1, name: 'design-review@example.test', notes: '', platform: 'openai', type: 'oauth',
  status: 'active', schedulable: true, concurrency: 10, priority: 50, rate_multiplier: 1,
  group_ids: [1], groups: [group],
  credentials: { model_mapping: Object.fromEntries(models.map(model => [model, model])) },
  extra: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const writes = []
const errors = []
const browser = await chromium.launch({
  headless: true,
  channel: process.env.E2E_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' })
const page = await context.newPage()
page.setDefaultTimeout(10000)
page.on('pageerror', error => errors.push(error.message))

await context.addInitScript(({ user }) => {
  localStorage.setItem('auth_token', 'ui-test-only')
  localStorage.setItem('auth_user', JSON.stringify(user))
  localStorage.setItem('sub2api_locale', 'zh')
  localStorage.setItem('theme', 'dark')
  localStorage.setItem('admin_guide_1_admin_v4_interactive', 'true')
}, { user })

await page.route('**/setup/status', route => route.fulfill({ json: { code: 0, data: { needs_setup: false } } }))
await page.route('**/api/v1/**', async route => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  const body = request.postDataJSON()
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) writes.push({ path, body })
  let data = {}
  if (path.endsWith('/auth/me')) data = { ...user, run_mode: 'standard' }
  else if (path.endsWith('/compliance')) data = { required: false }
  else if (path.endsWith('/settings/public')) data = { site_name: 'Sub2API', run_mode: 'standard' }
  else if (path.endsWith('/accounts/management-capabilities')) data = { can_manage_accounts: true }
  else if (path.endsWith('/accounts') || path.endsWith('/groups')) {
    data = request.method() === 'POST' ? { ...(path.endsWith('/accounts') ? account : group), ...body }
      : { items: path.endsWith('/accounts') ? [account] : [group], total: 1, pages: 1, page: 1, page_size: 20 }
  } else if (path.endsWith('/groups/all')) data = [group]
  else if (path.endsWith('/proxies/all')) data = []
  else if (path.endsWith('/accounts/1')) data = { ...account, ...(body || {}) }
  else if (path.endsWith('/groups/1')) data = { ...group, ...(body || {}) }
  else if (path.endsWith('/account-quality-plans') || path.endsWith('/account-quality-templates')) data = []
  else if (path.endsWith('/account-quality-results')) data = { items: [], next_cursor: 0 }
  else if (path.endsWith('/bulk-update')) data = { success: 1, failed: 0, success_ids: [1], failed_ids: [], results: [] }
  else if (path.includes('check-mixed-channel')) data = { has_risk: false }
  else if (path.includes('available-models')) data = { models }
  else if (path.includes('models')) data = []
  else if (path.includes('auto-bps')) data = { enabled: false }
  else if (path.includes('upstream-billing-rates')) data = { items: [], total: 0 }
  await route.fulfill({ json: { code: 0, message: '', data } })
})

async function screenshot(name) {
  if (output) await page.screenshot({ path: join(output, name + '.png') })
}

async function assertFrame(dialog) {
  const layout = await dialog.evaluate(element => {
    const footer = element.querySelector('.modal-footer').getBoundingClientRect()
    const content = element.querySelector('.modal-content')
    const body = element.querySelector('.modal-body')
    return {
      footerBottom: footer.bottom, viewport: innerHeight,
      width: content.clientWidth, scrollWidth: content.scrollWidth,
      bodyHeight: body.clientHeight, bodyScrollHeight: body.scrollHeight,
    }
  })
  assert(layout.footerBottom <= layout.viewport + 1, 'Save actions must stay in the viewport')
  assert(layout.scrollWidth <= layout.width + 1, 'Dialog must not overflow horizontally')
  assert(layout.bodyScrollHeight <= layout.bodyHeight + 1, 'Only the selected panel should scroll')
}

async function visitTabs(dialog) {
  for (const tab of await dialog.getByRole('tab').all()) {
    await tab.click()
    assert.equal(await dialog.getByRole('tabpanel').count(), 1)
    await assertFrame(dialog)
  }
}

try {
  await page.goto(baseURL + '/admin/accounts')
  await page.getByText(account.name, { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const edit = page.getByRole('dialog', { name: '编辑账号', exact: true })
  await visitTabs(edit)

  await edit.getByRole('tab', { name: /模型与映射/ }).click()
  const selectedModels = edit.locator('[data-testid="selected-models"]').first()
  assert.equal(await selectedModels.locator(':scope > span').count(), 6)
  await edit.getByRole('button', { name: '展开全部（120）', exact: true }).click()
  assert.equal(await selectedModels.locator(':scope > span').count(), 120)
  assert((await selectedModels.boundingBox()).height <= 176, 'Large model lists must remain bounded')
  await edit.getByRole('button', { name: '收起列表', exact: true }).click()
  await screenshot('account-models-desktop')

  await edit.getByRole('tab', { name: /基本信息/ }).click()
  const name = edit.locator('[data-tour="edit-account-form-name"]')
  await name.fill('')
  await edit.getByRole('tab', { name: /配额与保护/ }).click()
  await edit.getByRole('button', { name: '更新', exact: true }).click()
  assert(await name.evaluate(element => document.activeElement === element), 'Reveal and focus invalid fields in other tabs')
  await name.fill('Updated account')
  await edit.getByRole('tab', { name: /模型与映射/ }).click()
  // Guided tours must be able to reveal their targets across tabs.
  await name.dispatchEvent('settings-reveal', { bubbles: true })
  assert(await name.isVisible())
  assert.equal(await name.inputValue(), 'Updated account', 'Navigation must preserve unsaved values')
  await screenshot('account-general-desktop')

  await edit.getByRole('tab', { name: /基本信息/ }).focus()
  await page.keyboard.press('ArrowDown')
  assert.match(await edit.locator('[aria-selected="true"]').innerText(), /连接与认证/)
  for (const viewport of [{ width: 893, height: 820 }, { width: 390, height: 844 }, { width: 800, height: 480 }]) {
    await page.setViewportSize(viewport)
    await visitTabs(edit)
    if (viewport.width === 390) await screenshot('account-mobile')
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await edit.getByRole('button', { name: '更新', exact: true }).click()
  await edit.waitFor({ state: 'hidden' })
  const update = writes.find(item => item.path.endsWith('/accounts/1'))
  assert.equal(update.body.name, 'Updated account')
  assert.deepEqual(update.body.credentials.model_mapping, account.credentials.model_mapping, 'Saving must preserve all 120 model entries')
  console.log('PASS edit: tabs, 120 models, keyboard, hidden-field validation, responsive frames and update payload')

  await page.getByRole('button', { name: '添加账号', exact: true }).click()
  const create = page.getByRole('dialog').filter({ has: page.locator('#create-account-form') })
  await create.locator('[data-tour="account-form-name"]').fill('New API account')
  await create.getByRole('tab', { name: /平台与类型/ }).click()
  await create.getByRole('button', { name: 'OpenAI', exact: true }).click()
  await create.getByRole('button', { name: /API/ }).click()
  await create.getByRole('tab', { name: /基本信息/ }).click()
  await create.locator('button[form="create-account-form"]').click()
  const key = create.locator('input[type="password"][required]')
  assert(await key.isVisible(), 'Required credentials must reveal the connection tab')
  assert(await key.evaluate(element => document.activeElement === element))
  await key.fill('sk-ui-test-only')
  await visitTabs(create)
  await screenshot('account-create')
  await create.locator('button[form="create-account-form"]').click()
  await create.waitFor({ state: 'hidden' })
  const creation = writes.find(item => item.path === '/api/v1/admin/accounts')
  assert.equal(creation.body.name, 'New API account')
  assert.equal(creation.body.platform, 'openai')
  assert.equal(creation.body.credentials.api_key, 'sk-ui-test-only')
  console.log('PASS create: provider changes, hidden required credentials and complete save payload')

  await page.getByRole('checkbox').first().check()
  await page.getByRole('button', { name: '批量更新', exact: true }).click()
  const bulk = page.getByRole('dialog').filter({ has: page.locator('#bulk-edit-account-form') })
  await visitTabs(bulk)
  await bulk.getByRole('tab', { name: /调度与计费/ }).click()
  await bulk.locator('#bulk-edit-concurrency-enabled').check()
  await bulk.locator('#bulk-edit-concurrency').fill('17')
  await bulk.getByRole('tab', { name: /基本信息/ }).click()
  await bulk.locator('button[form="bulk-edit-account-form"]').click()
  await bulk.waitFor({ state: 'hidden' })
  const bulkWrite = writes.find(item => item.path.endsWith('/bulk-update'))
  assert.equal(bulkWrite.body.concurrency, 17)
  assert.equal(bulkWrite.body.credentials, undefined, 'Unselected bulk settings must stay unchanged')
  console.log('PASS bulk: selected fields survive tab navigation and unselected fields stay unchanged')

  await page.goto(baseURL + '/admin/groups')
  await page.getByText(group.name, { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '编辑', exact: true }).first().click()
  const groupEdit = page.getByRole('dialog').filter({ has: page.locator('#edit-group-form') })
  await visitTabs(groupEdit)
  await groupEdit.getByRole('tab', { name: /基本信息/ }).click()
  await screenshot('group-edit')
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await screenshot('group-edit-light')
  await groupEdit.getByRole('button', { name: '取消', exact: true }).click()
  console.log('PASS groups: all settings categories, persistent footer and light/dark rendering')

  await page.goto(baseURL + '/admin/account-quality')
  await page.getByRole('button', { name: '新建检测规则', exact: true }).first().click()
  const quality = page.getByRole('dialog').filter({ has: page.locator('#quality-rule-form') })
  await visitTabs(quality)
  await quality.getByRole('tab', { name: /探测规则/ }).click()
  await screenshot('quality-rules')
  await page.setViewportSize({ width: 390, height: 844 })
  await visitTabs(quality)
  console.log('PASS quality: rule editor categories and fixed actions on desktop and mobile')
  assert.deepEqual(errors, [], 'No browser runtime errors')
  console.log('All settings layout browser checks passed.')
} catch (error) {
  await screenshot('failure')
  console.error('Browser errors:', errors)
  throw error
} finally {
  await browser.close()
}
