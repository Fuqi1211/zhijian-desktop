export interface AppInfo {
  version: string
  platform: 'aix' | 'darwin' | 'freebsd' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd'
}

export interface BootstrapDesktopApi {
  getAppInfo: () => Promise<AppInfo>
}
