import { contextBridge, ipcRenderer } from 'electron'
import type { BootstrapDesktopApi } from '../shared/contracts'

const desktop: BootstrapDesktopApi = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info')
}

contextBridge.exposeInMainWorld('desktop', desktop)
