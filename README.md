<div align="center">
	<h1>Chobits</h1>
	<p>Electron 开发的 AI 桌面精灵 / 助手 / 工具</p>
	<p>
		<a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-green.svg"></a>
		<img alt="Node" src="https://img.shields.io/badge/Node-%E2%89%A518.x-339933?logo=node.js&logoColor=white" />
		<img alt="Electron" src="https://img.shields.io/badge/Electron-38-blue?logo=electron&logoColor=white" />
		<img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" />
		<img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" />
	</p>
</div>

> An AI desktop assistant built with Electron, Vite, and React. Cross‑platform, extensible, and private‑by‑default.

## ✨ 功能特性

- 多模型与多厂商支持：OpenAI、Anthropic、Gemini、DeepSeek、Qwen、智谱、Ollama 等（见 `resources/providers`）
- 对话助手与提示词：可配置模型、温度、系统提示，支持多种选择策略与代理封装
- 本地数据库与向量检索：SQLite（better-sqlite3）+ sqlite-vec，ORM 使用 Drizzle
- 资源与媒体处理：内置 ffmpeg、yt-dlp 下载与转码，资源页 / 媒体播放
- 标签与工作区：资源标签、回收站、工作区管理
- 全局快捷键：uiohook-napi 支持系统级快捷键
- 自动更新：electron-updater
- 现代前端栈：Vite + React + Tailwind + TypeScript

## 🧱 技术栈

- 桌面：Electron 38、electron-builder
- 前端：Vite 5、React 18、Tailwind CSS、Sass、Radix UI、Framer Motion
- 语言与质量：TypeScript、ESLint、Prettier、Vitest
- 数据库：Drizzle ORM、SQLite（better-sqlite3）、sqlite-vec
- AI/LLM：OpenAI / Anthropic / Gemini / DeepSeek / Qwen / 智谱 / Ollama（可扩展）

## 🗺️ 目录概览

- `electron/`：主进程与预加载；AI 模块（注册表、模型加载、选择策略、IPC、设置/提示/实例存储等）
- `src/`：渲染进程（React UI），页面与组件（助手、模型、资源、标签、设置等）
- `resources/`：第三方资源（ffmpeg、yt-dlp、模型提供商清单与图标、sprites）
- `drizzle/`：数据库迁移与元信息（由 Drizzle 生成）
- `dist-electron/`、`dist/`：构建产物

## 🚀 快速开始

前置要求：

- Node.js ≥ 18（建议 LTS）
- 推荐包管理器：pnpm（亦可使用 npm/yarn）
- macOS 需安装 Xcode Command Line Tools 用于原生模块编译

安装与启动开发环境：

```bash
pnpm install
pnpm dev
```

默认会启动 Vite 开发服务器并自动拉起 Electron 应用。

可选：VS Code 调试

- 工作区内含任务 “Before Debug”，可用于配合 VS Code Debug 启动前准备。

## 🏗️ 构建与发布

一键构建（类型检查 + 前端打包 + Electron 打包）：

```bash
pnpm build
```

原生依赖（better-sqlite3 / sqlite-vec / sharp 等）在某些平台或 Electron 升级后需要重建：

```bash
# 通用重建（推荐）
pnpm rebuild

# 或仅重建特定模块
pnpm rebuild:sqlite
pnpm rebuild:sqlite-vec
```

打包产物默认输出到 `release/<version>`，配置见 `electron-builder.json`。

可选：生成应用图标（从 `build/icon.png`）

```bash
pnpm build:icon
```

## 📦 外部工具（可选）

项目内置脚本可下载对应平台的 ffmpeg 与 yt-dlp：

```bash
# macOS (Apple Silicon)
pnpm download-ffmpeg-darwin-arm64
pnpm download-ytdlp-darwin

# Windows (示例)
pnpm download-ffmpeg-win32-x64
pnpm download-ytdlp-win32
```

下载后的二进制会被打包器按 `electron-builder.json` 复制到应用资源目录。

## 🗄️ 数据库（Drizzle + SQLite）

- 模型定义：`electron/main/db/schema.ts`
- 迁移输出：`drizzle/`

常用命令：

```bash
pnpm db:generate   # 根据 schema 生成迁移
pnpm db:push       # 推送 schema 到数据库（开发场景）
pnpm db:studio     # 可视化管理（Drizzle Studio）
```

## 🔌 模型与服务商配置

- 供应商与模型清单位于：`resources/providers/*.models.json` 与 `*.schema.json`
- 应用内提供设置界面保存 API Key（通过 keytar 安全存储）
- 支持兼容 OpenAI API 的服务（见 `openai-compatible.schema.json`）

扩展：新增提供商通常需要添加模型清单与加载逻辑（参考 `electron/ai/providers` 与 `electron/ai/models-loader.ts`）。

## 🧪 测试

项目使用 Vitest：

```bash
pnpm test
```

测试包含 `test/**/*.spec.ts` 等用例。仓库中还引入了 `@playwright/test` 以便编写端到端测试（可按需配置运行脚本）。

## 🧭 架构速览

- Main 进程：窗口、协议、更新、数据库与 AI 管线（模型选择、会话、标签、嵌入）
- Preload：受控暴露 API 给渲染层
- Renderer：React + Tailwind UI，多页面（助手、资源、模型、设置等）
- IPC：`electron/ai/ipc-main.ts` 与 `electron/ai/ipc-renderer.ts` 进行通信

## 🧰 故障排查

- 原生依赖编译失败或 Electron 升级后崩溃 → 运行 `pnpm rebuild` 或针对性 `rebuild:sqlite / rebuild:sqlite-vec`
- macOS 打包权限相关（麦克风/摄像头/语音识别） → 已在 `electron-builder.json` 配置 `entitlements` 与权限描述
- Sharp/Libvips 打包体积或无法加载 → 已在 asarUnpack 中配置必要解包；请确保未被安全策略阻止
- ffmpeg/yt-dlp 不可用 → 先执行下载脚本或在设置中配置外部路径

## 🤝 贡献

欢迎 PR 与 Issue！

开发规范：

```bash
pnpm lint   # 代码检查
```

提交前尽量保持类型通过、lint 无误，并补充必要的测试与文档。

## 📸 截图

可在 `test/screenshots/` 放置或更新应用截图以展示关键功能。

## 📄 许可证

本项目使用 MIT 许可证，详见 [LICENSE](./LICENSE)。

---

Made with ❤️ using Electron, Vite and React.
