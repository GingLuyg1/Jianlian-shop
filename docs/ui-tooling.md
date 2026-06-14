# UI 工具安排

本项目已安排以下 Web UI 开发工具：

| 类型 | 工具 | 状态 |
| --- | --- | --- |
| 样式提示 | Tailwind CSS IntelliSense | 已通过 `.vscode/extensions.json` 推荐安装 |
| 组件库 | shadcn/ui | 已在项目中使用，配置见 `components.json` |
| 图标库 | Lucide React | 已安装并在页面中使用 |
| 动效库 | Motion / Framer Motion | 已安装，建议只用于登录页、轮播、卡片反馈等少量动效 |
| 页面测试 | Playwright | 已安装，配置见 `playwright.config.ts` |
| 独立组件开发 | Storybook | 已安装，配置见 `.storybook/` |

常用命令：

```bash
npm run storybook
npm run build-storybook
npm run test:e2e
npm run test:e2e:ui
```

本机工具说明：

- Codex IDE 插件属于编辑器扩展，需要在 VS Code、Cursor 或 Windsurf 中手动安装。
- Figma MCP Server 属于本机 MCP 配置，需要在 Codex/编辑器的 MCP 设置中单独接入，不能作为普通 npm 依赖写进项目。
- React Scan 最新版要求 Node 20.19+，当前项目绑定的 Node 是 20.11.1；后续升级 Node 后再接入性能检查更稳。
