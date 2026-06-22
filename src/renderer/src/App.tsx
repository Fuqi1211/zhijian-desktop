import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/contracts'

export function App(): React.JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.desktop.getAppInfo().then(setAppInfo)
  }, [])

  return (
    <main className="launch-shell">
      <section className="launch-card" aria-labelledby="launch-title">
        <span className="brand-mark" aria-hidden="true" />
        <p className="eyebrow">私人笔记 · 完全离线</p>
        <h1 id="launch-title">纸间</h1>
        <p>桌面空间已经备好，正在铺开你的纸页。</p>
        <small>{appInfo ? `版本 ${appInfo.version}` : '正在连接本地服务…'}</small>
      </section>
    </main>
  )
}
