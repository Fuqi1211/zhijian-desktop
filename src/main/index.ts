import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  shell,
  type BrowserWindowConstructorOptions
} from 'electron'
import { join } from 'node:path'
import { registerDesktopApi } from './services/desktop-api'
import type { NoteRepository } from './db/repository'
import { createUpdaterController, type UpdaterController } from './services/updater'
import type { AppSettings } from '../shared/contracts'

let mainWindow: BrowserWindow | null = null
let repository: NoteRepository | null = null
let updater: UpdaterController | null = null
let tray: Tray | null = null
let isQuitting = false
let hasShownTrayNotice = false
let saveWindowTimer: ReturnType<typeof setTimeout> | null = null

if (process.env.ZHIJIAN_USER_DATA_DIR) {
  app.setPath('userData', process.env.ZHIJIAN_USER_DATA_DIR)
}

if (process.env.ZHIJIAN_E2E === '1') {
  process.on('uncaughtException', (error) => {
    console.error(error)
    app.exit(1)
  })
}

function e2eLog(message: string): void {
  if (process.env.ZHIJIAN_E2E === '1') console.error('[zhijian-e2e] ' + message)
}

function isTrustedRenderer(url: string): boolean {
  if (process.env.ELECTRON_RENDERER_URL) return url.startsWith(process.env.ELECTRON_RENDERER_URL)
  return url.startsWith('file://')
}

function showMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function sendNewNoteCommand(): void {
  showMainWindow()
  mainWindow?.webContents.send('app:new-note')
}

function createWindow(bounds?: AppSettings['windowBounds']): BrowserWindow {
  e2eLog('createWindow:start')
  const options: BrowserWindowConstructorOptions = {
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 820,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 820,
    minHeight: 600,
    show: false,
    backgroundColor: '#f3ede2',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  }
  const window = new BrowserWindow(options)

  window.once('ready-to-show', () => {
    e2eLog('window:ready-to-show')
    if (bounds?.maximized) window.maximize()
    window.show()
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRenderer(url)) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

function saveWindowStateNow(): void {
  if (!mainWindow || !repository) return
  if (mainWindow.isDestroyed()) return
  const bounds = mainWindow.getBounds()
  repository.updateSettings({
    windowBounds: {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: mainWindow.isMaximized()
    }
  })
}

function scheduleWindowStateSave(): void {
  if (!mainWindow || !repository) return
  if (saveWindowTimer) clearTimeout(saveWindowTimer)
  saveWindowTimer = setTimeout(saveWindowStateNow, 450)
}

function createTray(): void {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
    '<rect x="14" y="10" width="32" height="42" rx="7" fill="#9c5c43"/>' +
    '<path d="M38 10v12h8" fill="#ead1c3"/>' +
    '<path d="M22 30h18M22 38h14" stroke="#fffaf1" stroke-width="4" stroke-linecap="round"/>' +
    '</svg>'
  const icon = nativeImage
    .createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))
    .resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('纸间')
  tray.on('double-click', showMainWindow)
  refreshTrayMenu()
}

function refreshTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示纸间', click: showMainWindow },
      { label: '新建笔记', accelerator: 'CommandOrControl+Alt+N', click: sendNewNoteCommand },
      { type: 'separator' },
      { label: '检查更新', click: () => void updater?.check() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
}

function createApplicationMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: '文件',
        submenu: [
          { label: '新建笔记', accelerator: 'CommandOrControl+N', click: sendNewNoteCommand },
          { label: '快速查找', accelerator: 'CommandOrControl+K', click: () => mainWindow?.webContents.send('app:open-command') },
          { type: 'separator' },
          { label: '导入 JSON', click: () => mainWindow?.webContents.send('app:import-json') },
          { label: '导出备份', click: () => mainWindow?.webContents.send('app:export-json') },
          { type: 'separator' },
          {
            label: '退出',
            accelerator: 'CommandOrControl+Q',
            click: () => {
              isQuitting = true
              app.quit()
            }
          }
        ]
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo', label: '撤销' },
          { role: 'redo', label: '重做' },
          { type: 'separator' },
          { role: 'cut', label: '剪切' },
          { role: 'copy', label: '复制' },
          { role: 'paste', label: '粘贴' },
          { role: 'selectAll', label: '全选' }
        ]
      },
      {
        label: '窗口',
        submenu: [
          { label: '显示主窗口', click: showMainWindow },
          { role: 'minimize', label: '最小化' },
          { role: 'togglefullscreen', label: '切换全屏' }
        ]
      },
      {
        label: '帮助',
        submenu: [
          { label: '检查更新', click: () => void updater?.check() },
          { label: '关于纸间', click: showMainWindow }
        ]
      }
    ])
  )
}

function registerGlobalShortcuts(): void {
  const ok = globalShortcut.register('CommandOrControl+Alt+N', sendNewNoteCommand)
  if (!ok) mainWindow?.webContents.send('app:shortcut-error', 'Ctrl+Alt+N 已被其他应用占用')
}

function registerBootstrapIpc(): void {
  ipcMain.handle('app:get-info', (event) => {
    const senderUrl = event.senderFrame?.url ?? ''
    if (!isTrustedRenderer(senderUrl)) throw new Error('Untrusted renderer')
    return { version: app.getVersion(), platform: process.platform }
  })
}

const hasSingleInstanceLock =
  process.env.ZHIJIAN_DISABLE_SINGLE_INSTANCE === '1' || app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

app.setAppUserModelId('com.kiko3127.zhijian')

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(() => {
  e2eLog('app:ready')
  registerBootstrapIpc()
  updater = createUpdaterController(() => mainWindow)
  e2eLog('repository:start')
  repository = registerDesktopApi({
    userDataPath: app.getPath('userData'),
    isTrustedRenderer,
    getMainWindow: () => mainWindow,
    hideMainWindow: () => mainWindow?.hide(),
    quitApp: () => {
      isQuitting = true
      app.quit()
    },
    updater
  })
  e2eLog('repository:ready')
  mainWindow = createWindow(repository.getSettings().windowBounds)
  mainWindow.on('resize', scheduleWindowStateSave)
  mainWindow.on('move', scheduleWindowStateSave)
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    if (repository?.getSettings().closeToTray ?? true) {
      event.preventDefault()
      mainWindow?.hide()
      if (!hasShownTrayNotice && tray && process.platform === 'win32') {
        hasShownTrayNotice = true
        tray.displayBalloon({ title: '纸间仍在运行', content: '可从托盘重新打开或彻底退出。' })
      }
    }
  })
  createApplicationMenu()
  createTray()
  registerGlobalShortcuts()
  e2eLog('app:bootstrapped')
  setTimeout(() => void updater?.check(), 10000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(repository?.getSettings().windowBounds)
    showMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  if (saveWindowTimer) clearTimeout(saveWindowTimer)
  saveWindowStateNow()
  globalShortcut.unregisterAll()
  tray?.destroy()
  repository?.close()
})
