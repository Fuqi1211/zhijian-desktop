# 纸间桌面版

纸间是一款安静、快速、完全本地保存的桌面笔记应用。它由原来的单文件网页应用迁移为 Electron + React + TypeScript 客户端，面向 Windows 10/11 x64 优先构建。

> 首个版本为未签名安装包，Windows SmartScreen 可能提示“未知发布者”。这是当前 unsigned 构建的正常现象。

## 下载

前往 GitHub Releases 下载最新版安装包：

- [纸间 v0.1.0](https://github.com/Fuqi1211/zhijian-desktop/releases/tag/v0.1.0)
- Windows 安装包：`Zhijian-0.1.0-x64-Setup.exe`

当前版本安装包 SHA-256：

```text
878511B97BEA3E926E167082F5C0F4F398D32886EA8B8D53B57FA9C2CC32347C
```

## 核心功能

- 双栏笔记布局，保留原网页应用的配色、节奏和暗色/亮色主题。
- 富文本编辑：标题、粗体、斜体、删除线、下划线、列表、引用、代码块和安全链接。
- 自动保存，约 350ms 防抖，退出前强制刷新。
- 本地 SQLite 持久化，启用 WAL、事务、软删除和撤销。
- 标题、正文和标签搜索，保留中文子串搜索语义。
- 标签统计、筛选、置顶、导入 JSON、导出 JSON。
- Windows 菜单、托盘、关闭到托盘、单实例运行。
- 全局 `Ctrl+Alt+N` 快速新建笔记。
- 自动更新状态接入，支持安装包、`latest.yml` 和 blockmap 发布。

## 技术栈

- Electron / electron-vite
- React / TypeScript
- TipTap
- Zustand
- SQLite：better-sqlite3 + Drizzle
- Zod
- Vitest / React Testing Library
- Playwright Electron
- electron-builder / electron-updater

## 本地开发

需要 Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run dist:win
```

说明：

- `npm test` 会把 `better-sqlite3` 重建为 Node ABI，用于 Vitest。
- `npm run test:e2e` 和 `npm run dist:win` 会在运行前重新按 Electron ABI 强制重建 `better-sqlite3`。
- 生产构建的 Windows 安装包输出在 `release/` 目录。

## 数据位置

数据只保存在当前 Windows 用户目录，不包含云同步、遥测、账户系统或数据库加密。SQLite 数据库由 Electron 的 `userData` 目录管理。

## 发布

本仓库当前发布版本为 `v0.1.0`。Release 资产包括：

- `Zhijian-0.1.0-x64-Setup.exe`
- `Zhijian-0.1.0-x64-Setup.exe.blockmap`
- `latest.yml`

CI 预留了将安装包发布到公开 Release 仓库的流程；正式分发前建议补充代码签名证书，降低 Windows SmartScreen 拦截概率。

## 许可证

当前仓库为 `UNLICENSED`。未经作者明确授权，请勿再分发或商用。
