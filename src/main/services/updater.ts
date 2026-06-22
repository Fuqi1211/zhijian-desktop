import { app, BrowserWindow } from 'electron'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../../shared/contracts'

export interface UpdaterController {
  getState: () => UpdateState
  check: () => Promise<UpdateState>
  install: () => void
}

export function createUpdaterController(getMainWindow: () => BrowserWindow | null): UpdaterController {
  let state: UpdateState = { phase: 'idle', message: '尚未检查更新' }

  function emit(next: UpdateState): UpdateState {
    state = next
    getMainWindow()?.webContents.send('updater:state', state)
    return state
  }

  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    emit({ phase: 'checking', message: '正在检查更新…' })
  })
  autoUpdater.on('update-available', (info) => {
    emit({ phase: 'available', message: '发现新版本，正在后台下载…', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    emit({ phase: 'not-available', message: '已经是最新版本' })
  })
  autoUpdater.on('download-progress', (progress) => {
    emit({ phase: 'downloading', message: '正在下载更新…', percent: progress.percent })
  })
  autoUpdater.on('update-downloaded', (info) => {
    emit({ phase: 'downloaded', message: '更新已下载，重启后安装', version: info.version })
  })
  autoUpdater.on('error', (error) => {
    emit({ phase: 'error', message: error.message || '检查更新失败' })
  })

  return {
    getState: () => state,
    check: async () => {
      if (!app.isPackaged) {
        return emit({ phase: 'not-available', message: '开发环境跳过自动更新；打包安装后启用' })
      }
      emit({ phase: 'checking', message: '正在检查更新…' })
      await autoUpdater.checkForUpdates()
      return state
    },
    install: () => {
      if (state.phase === 'downloaded') autoUpdater.quitAndInstall()
    }
  }
}
