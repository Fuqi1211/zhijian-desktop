import {
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type SaveDialogOptions
} from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  noteDraftSchema,
  noteQuerySchema,
  noteUpdateSchema,
  settingsPatchSchema,
  type FileResult,
  type UpdateState
} from '../../shared/contracts'
import { isSafeExternalUrl } from '../../shared/domain'
import { createRepository, type NoteRepository } from '../db/repository'

const updateState: UpdateState = { phase: 'idle', message: '尚未检查更新' }

function assertTrusted(event: IpcMainInvokeEvent, isTrustedRenderer: (url: string) => boolean): void {
  const url = event.senderFrame?.url ?? ''
  if (!isTrustedRenderer(url)) throw new Error('Untrusted renderer')
}

export function registerDesktopApi(options: {
  userDataPath: string
  isTrustedRenderer: (url: string) => boolean
  getMainWindow: () => BrowserWindow | null
  hideMainWindow: () => void
  quitApp: () => void
}): NoteRepository {
  const repository = createRepository(options.userDataPath)
  const handle = <Args extends unknown[], Result>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: Args) => Result | Promise<Result>
  ): void => {
    ipcMain.handle(channel, (event, ...args: Args) => {
      assertTrusted(event, options.isTrustedRenderer)
      return listener(event, ...args)
    })
  }

  handle('notes:list', (_event, query = {}) => repository.list(noteQuerySchema.parse(query)))
  handle('notes:get', (_event, id: string) => repository.get(String(id)))
  handle('notes:create', (_event, draft = {}) => repository.create(noteDraftSchema.parse(draft)))
  handle('notes:update', (_event, id: string, update = {}) =>
    repository.update(String(id), noteUpdateSchema.parse(update))
  )
  handle('notes:set-pinned', (_event, id: string, pinned: boolean) =>
    repository.setPinned(String(id), Boolean(pinned))
  )
  handle('notes:delete', (_event, id: string) => repository.delete(String(id)))
  handle('notes:undo-delete', (_event, id: string) => repository.undoDelete(String(id)))
  handle('notes:tags', () => repository.tagStats())

  handle('settings:get', () => repository.getSettings())
  handle('settings:update', (_event, patch = {}) => repository.updateSettings(settingsPatchSchema.parse(patch)))

  handle('files:export-json', async (): Promise<FileResult> => {
    const window = options.getMainWindow()
    const dialogOptions: SaveDialogOptions = {
      title: '导出纸间笔记',
      defaultPath: join(options.userDataPath, '纸间笔记-' + new Date().toISOString().slice(0, 10) + '.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const result = window
      ? await dialog.showSaveDialog(window, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions)
    if (result.canceled || !result.filePath) return { canceled: true }
    repository.exportToFile(result.filePath)
    return { canceled: false, path: result.filePath }
  })

  handle('files:import-json', async (): Promise<FileResult> => {
    const window = options.getMainWindow()
    const dialogOptions: OpenDialogOptions = {
      title: '导入纸间笔记',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const result = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return { canceled: true }
    const imported = repository.importJson(readFileSync(filePath, 'utf8'))
    return { canceled: false, path: filePath, imported: imported.imported }
  })

  handle('app:show', () => {
    const window = options.getMainWindow()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })
  handle('app:hide', () => options.hideMainWindow())
  handle('app:quit', () => options.quitApp())
  handle('app:open-external', async (_event, url: string) => {
    if (!isSafeExternalUrl(url)) throw new Error('Unsupported URL')
    await shell.openExternal(url)
  })

  handle('updater:get-state', () => updateState)
  handle('updater:check', () => ({ ...updateState, phase: 'checking', message: '更新系统将在桌面集成阶段启用' }))
  handle('updater:install', () => undefined)

  return repository
}
