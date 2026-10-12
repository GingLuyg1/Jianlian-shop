# V2.5 standalone 发布候选（未获 Production 执行批准）

此目录不替换现有 `scripts/production-release.sh` 或 `ecosystem.production.config.cjs`。当前线上 Nginx 转发到本机 3001，现有 PM2 进程从 Git release 执行 `next start`；上传 standalone 后直接复用旧脚本会失败。

1. 在与 Production 架构匹配的 Linux/Node 20 隔离环境，使用锁文件运行 `npm ci`、typecheck、lint、相关回归和 `npm run build`。构建不得带 Production 服务端密钥；10 月 14 日官方补丁发布后须先升级并全量重测。
2. 代码提交且审核后运行 `package-linux.sh /absolute/empty/output/path`。包只含 Next standalone、`.next/static`、`public`。对归档做脱敏扫描、SHA-256 校验、Linux 原生依赖检查和本地 HTTP 冒烟；勿将任何 `.env`、日志、测试数据库或私有配置放进包。
3. 获单独部署批准后，服务器先验证 SHA 与安全空间，上传归档到受控临时目录；仅在新 `/www/releases/jianlian-shop-<40位SHA>` 展开。保留当前 live、约定 rollback 和所有 Worker pin。环境配置从现有受控位置单独提供，不改动其内容，绝不打包；具体链接/注入方式需在上线审批单中定稿。
4. 用独立端口对新 `server.js` 做健康、登录页、静态资源和权限冒烟，再按审批过的切换步骤切换 PM2。候选 `ecosystem.candidate.cjs` 保持线上名称和 3001 端口，但它**不能与当前进程同时占用 3001**。
5. 现有单端口 PM2+Nginx 方案无法证明零中断原子切换。要真正原子切流，需预置双端口和 Nginx upstream 切换并单独审批 Nginx 配置；否则明确接受短暂切换窗口并保留旧 release 的快速回退。不得把本地文件指针模拟冒充线上原子切换。
6. 回退应切回受保护的旧 release 与原 PM2 配置，验证服务和 Worker；不得使用数据库整体恢复来回退应用。新 release 清理必须在验收后另行批准。

空间门禁：实际 Linux 压缩包 `A`、展开 release `B`、上传/展开/可能二次复制 `C`、日志及文件系统余量 `R` 必须实测。部署前可用空间至少 6 GiB，但还须满足 `free - (A + B + C + R)` 的审批余量。Windows 包体积不得代替 Linux 实测。
