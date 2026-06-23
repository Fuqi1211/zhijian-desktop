# 纸间桌面版发布说明

## 仓库与更新源

- 私有源码仓库：Kiko3127/zhijian-desktop
- 公开安装包与更新元数据仓库：Kiko3127/zhijian-releases
- GitHub Actions 发布标签格式：v0.1.0
- 发布所需 secret：RELEASES_TOKEN，需要能向公开发布仓库创建 Release 并上传资产。

## Windows 签名状态

首版 CI 预留发布流程，但未配置代码签名证书。生成的 NSIS 安装包可安装和更新，但 Windows SmartScreen 可能提示未知发布者。正式分发前应添加 PFX 或云签名服务，并在 electron-builder 配置中启用签名。

## 本地验证顺序

1. npm run typecheck
2. npm run lint
3. npm test
4. npm run rebuild:electron
5. npm run build
6. npm run test:e2e
7. npm run dist:win
