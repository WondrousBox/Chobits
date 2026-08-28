<div align="center">
	<img src="public/icon.png" alt="Chobits Logo" width="120" height="120" />
	<h1>Chobits</h1>
	<p><b>叽～</b> 你的 AI 桌面精灵 / 助手 / 工具</p>
	<p>基于 Electron、Vite 与 React 打造的 AI 桌面助手：跨平台、可扩展、隐私优先。</p>
	<p>
		<a href="./README.md">简体中文</a> ｜ <a href="./README.ja.md">日本語</a>
	</p>
	<p>
		<a href="https://madewithlove.org.in"><img alt="Made with Love" src="https://img.shields.io/badge/Made%20with-Love-ff69b4.svg"></a>
		<a href="https://github.com/WondrousBox/Chobits"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-Chobits-181717?logo=github"></a>
		<a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-green.svg"></a>
	</p>
	<p>
		<img alt="Node" src="https://img.shields.io/badge/Node-%E2%89%A518.x-339933?logo=node.js&logoColor=white" />
		<img alt="Electron" src="https://img.shields.io/badge/Electron-39-blue?logo=electron&logoColor=white" />
		<img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" />
		<img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" />
	</p>
</div>

> 💖 如果这个项目对你有帮助，欢迎在 [GitHub](https://github.com/WondrousBox/Chobits) 点个 Star —— 你的支持能让更多人发现小叽！

## ✨ 功能特性

- **多模型 / 多厂商支持**
  支持 OpenAI、Anthropic、Gemini、DeepSeek、Qwen、智谱、Ollama 等厂商，统一在应用内配置 API Key，随时切换或为不同会话选择不同模型。

- **桌面精灵式对话助手**
  - 浮在桌面上的小精灵形态，随时唤起对话。
  - 支持多会话、多系统提示词（角色预设）、上下文管理。
  - 可一键复制回复、整理内容、续写、润色等。

- **资源与知识库管理**
  - 将网页、文档、音视频、截图等收集为「资源」，集中管理。
  - 支持标签、工作区、回收站，方便按主题或项目归档。
  - 资源详情页支持预览、播放、查看关联的工作流任务结果。

- **媒体处理与下载**
  - 内置 ffmpeg 与 yt-dlp 的集成能力，可下载视频 / 音频并自动整理。
  - 支持转码、抽帧、压制等常见处理场景，通过工作流一键执行。

- **工作流与自动化（可视化）**
  - 通过画布拖拽节点，编排「Start → 处理节点 → 展示 / 输出」的流程。
  - 内置 OCR、转码、文档转 Markdown、AI 生成 / 理解、多媒体展示等节点。
  - 支持预设工作流和历史记录查看，方便复用与排查。

- **插件与扩展能力**
  - 提供插件管理页，可查看 / 安装 / 更新插件能力（如 ffmpeg / Tesseract / Whisper 等）。
  - 支持为工作流、下载、资源处理等扩展新的节点和能力。

- **标签与自动化规则**
  - 为资源打标签、建工作区，用于区分不同项目或生活领域。
  - 通过自动化规则，根据文件来源、类型、名称等条件自动打标签或分配到指定工作区。

- **全局快捷键与辅助机能**
  - 注册系统级快捷键，快速唤起助手、收藏当前资源等（可在设置中配置）。
  - 提供截图窗口、下载浮窗等辅助页面，更方便地把日常操作接入到 Chobits。

- **自动更新与跨平台**
  - 内置自动更新能力，保持应用保持最新。
  - 支持 macOS / Windows / Linux 三大桌面平台，统一体验。

## 💡 典型使用场景

- **日常知识助手**：写代码、写文案、翻译、查资料——在桌面角落随手唤起一个聊天精灵，问题问完就收起。
- **个人资料库 / 第二大脑**：把看过的文章、视频、PDF、截图存成「资源」，用标签和工作区按主题整理，再用工作流跑 OCR、提要、总结。
- **内容创作流水线**：为「剪视频 / 做播客 / 写博客」设计专用工作流：自动下载素材 → 转码 → 抽帧 / 转文字 → 生成大纲 / 文案。
- **多模型对比与调优**：在一个统一界面里配置多个模型，对同一问题同时试不同模型的效果，迭代自己的提示词模板。

## 🚀 快速开始

### 前置要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 18（建议 LTS） | 运行与构建 |
| pnpm | 9.x | **Node 18 用户请装 `pnpm@9`**（最新版 pnpm 要求 Node ≥ 22）：`npm i -g pnpm@9` |
| Xcode CLT | 仅 macOS | 原生模块编译 |
| libsecret | 仅 Linux | `keytar` 存取 API Key 所需，桌面版发行版一般自带（gnome-keyring / KWallet） |

### 三步把小叽带回家

```bash
# 1. 克隆
git clone <your-repo-url> && cd Chobits

# 2. 安装依赖（postinstall 会自动为 Electron 重建原生模块）
pnpm install

# 3. 启动开发模式（Vite + Electron 自动拉起）
pnpm dev
```

> **小叽提示 (・ω・)ノ**：如果 `pnpm install` 卡在 `onnxruntime-node` 的 postinstall
>（它的 CUDA 下载脚本不处理 302 跳转），跳过即可，CPU 版二进制已随包内置：
>
> ```bash
> ONNXRUNTIME_NODE_INSTALL=skip pnpm install
> ```

### 可选：下载平台资源二进制

以下功能依赖随附的第三方二进制，按平台执行对应脚本即可（也可以在「插件管理」页按需安装）：

| 平台 | 命令 |
| --- | --- |
| macOS (Apple Silicon) | `pnpm download-ffmpeg-darwin-arm64` `pnpm download-ytdlp-darwin` `pnpm download-bun-darwin-arm64` |
| macOS (Intel) | `pnpm download-bun-darwin-x64` |
| Windows | `pnpm download-ffmpeg-win32-x64` `pnpm download-ytdlp-win32` `pnpm download-bun-win32-x64` |
| Linux | `pnpm download-linux-resources` `pnpm download-bun-linux-x64` |

不下载也能正常启动和聊天，只是视频下载 / 转码、部分插件、录屏等功能不可用。

### 打包

```bash
pnpm build    # 输出到 release/<version>/，按当前平台生成安装包
```

- macOS：`dmg` / `zip`
- Windows：`nsis` 安装包
- Linux：`AppImage` / `deb`

## 🧪 测试与检查

```bash
pnpm test     # vitest 全量测试
pnpm lint     # eslint
npx tsc       # 类型检查
```

测试用例按域分目录组织（与 `docs/` 的系统划分一一对应）：

```text
test/
  ai/  sprite/  memory/  media/  workflow/  resource/
  scheduler/  capability/  persona/  onboarding/  analytics/  misc/
```

## 🗂 项目结构

```text
Chobits/
├── electron/     # 主进程 + preload（窗口、IPC、数据库、快捷键等）
├── src/          # 渲染进程（React 页面与组件）
├── packages/     # 领域包：ai / workflow / sherpa / tts / ocr / sprite-core / plugins ...
├── resources/    # 随附资源（平台二进制、精灵素材、工作流预设等；二进制用上面的脚本下载）
├── drizzle/      # 数据库迁移（drizzle-kit 生成）
├── docs/         # 各子系统设计文档
├── test/         # vitest 测试（按域分目录）
└── scripts/      # 构建与资源下载脚本
```

## ⚙️ 开发约定

- **数据库变更**：先改 schema 定义，再 `pnpm db:generate` 生成迁移，不要手写 SQL 迁移文件。
- **UI 组件**：shadcn 使用规范（Button 图标、tooltip 等）见 [AGENTS.md](./AGENTS.md)。
- **锁文件**：仓库不提交任何 lockfile（`pnpm-lock.yaml` 等已被 gitignore，上游 CI 亦不接受）。

## 🐧 平台说明

| 能力 | macOS | Windows | Linux |
| --- | --- | --- | --- |
| 核心功能（对话 / 资源 / 工作流） | ✅ | ✅ | ✅ |
| 媒体下载 / 转码 | ✅ | ✅ | ✅（需跑下载脚本） |
| 打包发布 | dmg / zip | nsis | AppImage / deb |
| 全局快捷键 / 划词 | ✅ | ✅ | 仅 X11，Wayland 下不可用 |

Linux 特别提示：精灵是透明无边框窗口，需要桌面混成器（GNOME / KDE 默认开启）；
`keytar` 依赖系统 secret service 保存 API Key。

## ❓ 常见问题

- **`pnpm install` 报 `onnxruntime-node` 下载失败（HTTP 302）**
  用 `ONNXRUNTIME_NODE_INSTALL=skip pnpm install`，见上文「小叽提示」。
- **启动时报 `VERS_1.21.0 not found` 之类的 onnxruntime 符号错误**
  仓库已通过 `package.json` 的 pnpm overrides 统一 onnxruntime-node 版本；请务必用 **pnpm**（而不是 npm）安装依赖，overrides 才生效。
- **Linux 下 API Key 存不进 / 读不出**
  确认系统里有 secret service 在运行（gnome-keyring 或 KWallet）。
- **Wayland 会话下全局快捷键不生效**
  全局输入监听依赖 X11，请切换到 X11 会话使用。

## 📸 截图

可在 `test/screenshots/` 放置或更新应用截图以展示关键功能。

## 声明

本项目为个人开发的非官方开源软件，与原作《Chobits（人形电脑天使心）》及其权利人无任何从属或合作关系。
项目中涉及的名称或元素仅为个人兴趣的引用，如权利人认为有不当之处，请联系作者（`yuqu.2233@gmail.com`），我会及时调整或移除相关内容。

## 📄 许可证

本项目以 [MIT 许可证](./LICENSE) 发布：

- **自由使用**：可自由使用、复制、修改、分发，包括商业用途。
- **保留声明**：分发时须保留原始版权与许可声明。
- **无担保**：软件按「现状」提供，作者不承担任何担保责任。
