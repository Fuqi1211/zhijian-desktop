import { test, expect } from '@playwright/test'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

async function launchApp(userDataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: {
      ...process.env,
      ZHIJIAN_USER_DATA_DIR: userDataDir,
      ZHIJIAN_DISABLE_SINGLE_INSTANCE: '1',
      ZHIJIAN_E2E: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
    }
  })
  const child = app.process()
  let processOutput = ''
  child.stdout?.on('data', (chunk) => {
    processOutput += String(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    processOutput += String(chunk)
  })
  let page: Page
  try {
    page = await Promise.race([
      app.firstWindow(),
      new Promise<never>((_resolve, reject) => {
        child.once('exit', (code) =>
          reject(new Error('Electron exited before opening a window: ' + String(code) + '\n' + processOutput))
        )
      })
    ])
  } catch (error) {
    const diagnostics = await app
      .evaluate(({ app, BrowserWindow }) => ({
        ready: app.isReady(),
        windows: BrowserWindow.getAllWindows().length
      }))
      .catch((diagError) => ({ error: String(diagError) }))
    throw new Error(String(error) + '\nDiagnostics: ' + JSON.stringify(diagnostics) + '\nOutput:\n' + processOutput, {
      cause: error
    })
  }
  await page.getByText('纸间').first().waitFor()
  return { app, page }
}

async function removeDirWithRetry(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch {
      await new Promise((resolveRetry) => setTimeout(resolveRetry, 500))
    }
  }
}

async function quitApp(app: ElectronApplication, page: Page): Promise<void> {
  const child = app.process()
  const exited = new Promise<void>((resolveExit) => {
    if (child.exitCode !== null) resolveExit()
    else child.once('exit', () => resolveExit())
  })
  await page.evaluate(() => window.desktop.app.quit()).catch(() => undefined)
  await Promise.race([exited, new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5000))])
  if (child.exitCode === null && !child.killed) child.kill()
  await app.close().catch(() => undefined)
}

test('persists a note across Electron restarts', async () => {
  test.setTimeout(90_000)
  const userDataDir = mkdtempSync(join(tmpdir(), 'zhijian-e2e-'))
  try {
    const first = await launchApp(userDataDir)
    await expect(first.page.getByText('欢迎来到纸间')).toBeVisible()
    await first.page.locator('button.new-note').first().click()
    await first.page.locator('.title-input').fill('E2E 桌面笔记')
    await first.page.waitForTimeout(700)
    await expect(first.page.getByText('已保存在此设备')).toBeVisible()
    await quitApp(first.app, first.page)

    const second = await launchApp(userDataDir)
    await expect(second.page.locator('.note-card strong').filter({ hasText: 'E2E 桌面笔记' })).toBeVisible()
    await quitApp(second.app, second.page)
  } finally {
    await removeDirWithRetry(userDataDir)
  }
})
