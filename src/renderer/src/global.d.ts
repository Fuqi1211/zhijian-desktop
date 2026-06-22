import type { BootstrapDesktopApi } from '../../shared/contracts'

declare global {
  interface Window {
    desktop: BootstrapDesktopApi
  }
}

export {}
