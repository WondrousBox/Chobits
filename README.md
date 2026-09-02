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

- **Live2D 桌面精灵**
  - 透明无边框的桌面小精灵，默认使用 Live2D 渲染（也支持视频精灵）。
  - 支持 trigger 动画、说话时的 lip-sync 口型、视线追踪与点击反馈。
  - 角色包管理：安装、切换、校验精灵角色包。

- **多厂商 AI 对话**
  - 支持 OpenAI、Anthropic、Gemini、DeepSeek、Qwen、智谱、Kimi、Ollama、vLLM 等厂商，统一配置 API Key，随时切换或为不同会话选择不同模型。
  - 多会话、多角色预设（系统提示词）、上下文管理。

- **语音能力**
  - Edge TTS 朗读：让小叽把回复读出来。
  - 录音转写（ASR）：本地 sherpa-onnx 离线识别，或走云端 transcribe。
  - 实时字幕与翻译。

- **角色包编辑**
  - 内置角色包管理器与编辑器（CharacterPackManager / CharacterPackEditor）、角色画廊（CharacterGallery）。
  - 窗口动画编辑器（WindowAnimationEditor），编排精灵的移动与演出。

- **全局快捷键与辅助机能**
  - 系统级快捷键：唤起助手、开关主窗口、截图等（可在设置中配置）。
  - 右键菜单快速操作；设置页覆盖提供商、快捷键、主题外观、网络代理、数据库备份等。

## 💡 典型使用场景

- **桌面精灵陪伴**：一只住在桌面角落的小叽，待机、走动、打招呼；戳一戳有反应，闲下来也会自己找点事做。
- **随手可得的 AI 对话**：写代码、写文案、翻译、查资料——快捷键唤起小助手，问完就收起；不同会话用不同模型和角色预设。
- **语音转写与朗读**：录音实时转文字（本地离线或云端），开会、访谈、随手记录都能用；回复用 Edge TTS 读出来，解放眼睛。

## 🚀 快速开始

### 前置要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 18（建议 LTS） | 运行与构建 |
| pnpm | ≥ 10 | `pnpm-workspace.yaml` 使用了 `allowBuilds` 字段，需要 pnpm 10+ |
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

> **小叽提示 (・ω・)ノ**：请务必用 **pnpm 10+** 安装依赖——仓库通过 `pnpm-workspace.yaml`
> 的 `allowBuilds` 白名单控制哪些依赖允许跑安装脚本（better-sqlite3、keytar、sharp 等），
> 旧版 pnpm 不认识这个字段，原生模块可能编译不出来。

### 可选：下载平台资源二进制

媒体下载 / 转码依赖随附的 ffmpeg 与 yt-dlp，按平台执行对应脚本即可：

| 平台 | 命令 |
| --- | --- |
| macOS (Apple Silicon) | `pnpm download-ffmpeg-darwin-arm64` `pnpm download-ytdlp-darwin` |
| macOS (Intel) | `pnpm download-ytdlp-darwin` |
| Windows | `pnpm download-ffmpeg-win32-x64` `pnpm download-ytdlp-win32` |
| Linux | 暂无预置脚本，请自行安装 ffmpeg / yt-dlp |

不下载也能正常启动、聊天和语音转写，只是视频下载 / 转码等功能不可用。

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
pnpm lint     # eslint + 目录边界检查
npx tsc       # 类型检查
```

测试用例按域分目录组织：

```text
test/
  ai/  capability/  media/  misc/  resource/  sprite/  utils/
```

## 🗂 项目结构

```text
Chobits/
├── electron/     # 主进程 + preload（窗口、IPC、数据库、快捷键等）
├── src/          # 渲染进程（React 页面与组件，含 vendored live2d-sdk）
├── packages/     # 领域包：ai / common / event / plugins / sherpa / sprite-core / tts
├── resources/    # 随附资源（平台二进制、精灵素材等；二进制用上面的脚本下载）
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
| 核心功能（精灵 / 对话 / 语音） | ✅ | ✅ | ✅ |
| 媒体下载 / 转码 | ✅（需跑下载脚本） | ✅（需跑下载脚本） | 自行安装 ffmpeg / yt-dlp |
| 打包发布 | dmg / zip | nsis | AppImage / deb |
| 全局快捷键 | ✅ | ✅ | 仅 X11，Wayland 下不可用 |

Linux 特别提示：精灵是透明无边框窗口，需要桌面混成器（GNOME / KDE 默认开启）；
`keytar` 依赖系统 secret service 保存 API Key。

## ❓ 常见问题

- **Linux 下 API Key 存不进 / 读不出**
  确认系统里有 secret service 在运行（gnome-keyring 或 KWallet）。
- **Wayland 会话下全局快捷键不生效**
  全局输入监听依赖 X11，请切换到 X11 会话使用。
- **视频下载 / 转码提示找不到 ffmpeg / yt-dlp**
  按上文「下载平台资源二进制」执行对应脚本即可。

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
