import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, UpdateState } from '../shared/contracts'

const desktop: DesktopApi = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  notes: {
    list: (query) => ipcRenderer.invoke('notes:list', query),
    get: (id) => ipcRenderer.invoke('notes:get', id),
    create: (draft) => ipcRenderer.invoke('notes:create', draft),
    update: (id, update) => ipcRenderer.invoke('notes:update', id, update),
    setPinned: (id, pinned) => ipcRenderer.invoke('notes:set-pinned', id, pinned),
    delete: (id) => ipcRenderer.invoke('notes:delete', id),
    undoDelete: (id) => ipcRenderer.invoke('notes:undo-delete', id),
    tags: () => ipcRenderer.invoke('notes:tags')
  },
  files: {
    importJson: () => ipcRenderer.invoke('files:import-json'),
    exportJson: () => ipcRenderer.invoke('files:export-json')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch)
  },
  app: {
    show: () => ipcRenderer.invoke('app:show'),
    hide: () => ipcRenderer.invoke('app:hide'),
    quit: () => ipcRenderer.invoke('app:quit'),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    onNewNote: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('app:new-note', listener)
      return () => ipcRenderer.removeListener('app:new-note', listener)
    },
    onOpenCommand: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('app:open-command', listener)
      return () => ipcRenderer.removeListener('app:open-command', listener)
    },
    onImportJson: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('app:import-json', listener)
      return () => ipcRenderer.removeListener('app:import-json', listener)
    },
    onExportJson: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('app:export-json', listener)
      return () => ipcRenderer.removeListener('app:export-json', listener)
    },
    onShortcutError: (callback: (message: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, message: string): void => callback(message)
      ipcRenderer.on('app:shortcut-error', listener)
      return () => ipcRenderer.removeListener('app:shortcut-error', listener)
    }
  },
  updater: {
    getState: () => ipcRenderer.invoke('updater:get-state'),
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onState: (callback: (state: UpdateState) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: UpdateState): void => callback(state)
      ipcRenderer.on('updater:state', listener)
      return () => ipcRenderer.removeListener('updater:state', listener)
    }
  }
}

contextBridge.exposeInMainWorld('desktop', desktop)
