<div align="center">
	<img src="public/icon.png" alt="Chobits Logo" width="120" height="120" />
	<h1>Chobits</h1>
	<p>Electron 开发的 AI 桌面精灵 / 助手 / 工具</p>
	<p>
		<a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-green.svg"></a>
		<img alt="Node" src="https://img.shields.io/badge/Node-%E2%89%A518.x-339933?logo=node.js&logoColor=white" />
		<img alt="Electron" src="https://img.shields.io/badge/Electron-39-blue?logo=electron&logoColor=white" />
		<img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" />
		<img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" />
	</p>
</div>

> Chobits 是一个以桌面精灵为入口的 AI 工作空间：在同一个本地应用中完成对话、资料管理、媒体处理、记忆沉淀和自动化工作流。

## ✨ 功能特性

### AI 对话与工具链

- 内置统一的 Provider / Model / Preset 配置，支持 OpenAI、Anthropic、Gemini、DeepSeek、Qwen、智谱、Ollama、MiniMax、GPTeam、Z.ai，以及自定义 OpenAI-compatible 服务。
- 支持多会话、角色提示词、资源上下文和对话线路记忆；可查看当前会话的目标、待办、决策、约束、阻碍和关键线索。
- AI 工具覆盖网页搜索与阅读、资源查询与创建、总结、翻译、字幕阅读、图片理解与生成、卡片推送、文件操作、工作流运行和技能调用。
- Skill 支持从内置、用户、项目和插件目录加载；文件写入、Shell、下载、工作流等高影响操作带有运行时保护。
- 媒体链路支持“下载 → 转写 → 翻译 / 总结”，工具结果会返回新资源 ID，后续步骤可以直接复用刚生成的资源。
- 支持项目跟踪：从对话中识别项目候选，关联会话，维护里程碑、事件、风险和提醒，并提供项目快照、时间线、审计、隐私控制、导出、归档和删除。

### 桌面精灵与角色系统

- 精灵常驻桌面，支持气泡、忙碌状态、跟随窗口、瞬移（`warpTo`）、移动避让和多种入口窗口。
- 角色包可导入、切换和管理；本地角色支持动画、外观、角色图集、AI 图像生成 / 编辑画布和角色编辑器，内置能力解锁、等级、经验、好感度、技能树、背包和成就。
- `Quest` 新手任务和功能自述任务提供确定性的引导流程，覆盖创建工作空间、首次拖拽文件、打开资源库、工作流、字幕、ASR、TTS、记忆、插件等功能，并在完成后发放奖励。
- 支持 AI 自发说话、动作编排、入场粒子效果、运动效果和音乐律动；播放音乐时可打开频谱窗口并驱动精灵跳舞。
- 语音支持 Edge 等系统语音、本地 Sherpa-ONNX TTS，以及当前内置的 MiniMax AI Provider 语音合成。聊天可开启实时朗读，并支持暂停、恢复和停止。

### 资源库与工作空间

- 将本地文件、网页、文档、图片、音频、视频、字幕、录音、截图和生成结果统一保存为资源。
- 支持工作空间、文件夹树、标签、收藏、搜索、回收站、资源项目目录和工作空间导入 / 导出。
- 支持拖拽文件到精灵或资源页导入；也可以链接本地文件夹，按需扫描、监听变化、处理缺失文件并查看同步冲突。
- 支持自动化规则，按文件来源、类型、名称等条件自动打标签或分配到指定工作区。
- 资源预览支持图片、文本、音视频和 RSS；媒体播放器提供波形、频谱、字幕轨道、标注和播放控制。
- 字幕工作台支持多轨时间轴、片段编辑、跟随播放、翻译、总结、TTS 朗读、音频轨道、字幕样式和视频压制导出。

### 媒体处理与可视化工作流

- 通过画布拖拽节点编排 DAG 工作流，支持预设和自定义定义、动态输入 / 输出、端口校验、错误策略、并发控制、取消和运行日志。
- 内置节点覆盖资源读写、FFmpeg 转码、视频关键帧、文档转 Markdown、Whisper / Fast-Whisper / FunASR / Parakeet 转写、Tesseract / PaddleOCR、AI 对话、图片理解 / 生成、音乐生成和结果展示。
- 工作流运行状态会同步到资源库和精灵；运行记录按工作空间保存，支持历史查询、失败诊断、敏感信息脱敏和自动保留策略。
- 通过插件管理器安装和维护 FFmpeg、Tesseract、Whisper、PaddleOCR、Sherpa-ONNX 等引擎及模型，按需启用本地能力。
- 工作流文档统一收录于 [工作流文档索引](docs/workflow/README.md)，当前模块和迁移状态见 [工作流模块 README](packages/workflow/README.md)。

### 内容订阅与系统辅助

- 支持 YouTube 频道订阅、Feed 刷新、历史内容分页、缩略图、自动下载、下载队列和资源库归档；RSS 来源接口可扩展到其他 Feed 类型。
- 内置 YouTube 下载、登录 Cookie 管理和下载浮窗，支持质量、保存目录和下载进度配置。
- 提供麦克风 / 系统声音录音与 ASR、网页录音、截图窗口、选中文本英文学习 / 解释，以及全局快捷键。
- 支持 AI 用量统计：按 Provider、模型、功能、计费口径和时间范围查看趋势、明细和异常状态。
- 支持自动更新、开发 / 生产数据目录隔离和 SQLite 数据库备份 / 恢复。

## 💡 典型使用场景

- **桌面知识助手**：双击或右键精灵打开聊天，直接引用资源、网页和历史记忆，让对话结果回到资源库。
- **视频理解流水线**：粘贴 YouTube 链接，下载视频后自动转写字幕，再翻译或总结新生成的字幕资源。
- **个人资料库 / 第二大脑**：链接本地资料目录，使用标签和工作空间整理内容，让记忆系统提取主题、事实、偏好和项目线索。
- **字幕与内容创作**：在时间轴中校对字幕、翻译、生成配音和音频轨道，预览后导出带字幕的视频。
- **项目推进**：让 AI 从多轮对话中识别长期项目，记录里程碑、风险和下一步，并在项目中心审核和管理状态。
- **音乐与角色互动**：使用音乐 / 歌词生成工具创建音频资源，播放时让精灵根据频谱和节拍执行动作。

## 🚀 快速开始

### 前置要求

- Node.js ≥ 18（建议使用 LTS）
- pnpm（仓库包含 `pnpm-lock.yaml`）
- macOS 原生模块编译需要 Xcode Command Line Tools；Windows / macOS 的 FFmpeg、ASR、OCR 和 TTS 模型可在插件管理器中按需安装

### 安装与开发

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会启动 Vite 开发服务器并拉起 Electron 应用。首次启动后，按照精灵引导创建工作空间，再在设置中配置至少一个可用的 AI Provider。

## 🔐 数据与隐私

- 会话、资源索引、记忆和工作流记录默认保存在本地 SQLite 与工作空间目录中。
- API Key、Provider 密钥和相关敏感配置由应用保存到用户数据目录；工作流日志会对密钥、Cookie、Token 等字段做脱敏和长度限制。
- 只有在用户配置并调用对应 Provider 或网络功能时，相关内容才会发送到外部服务；本地 ASR、OCR、TTS 插件可在不调用云端模型的情况下运行。

## 声明

本项目为个人开发的非官方开源软件，与原作《Chobits（人形电脑天使心）》及其权利人无任何从属或合作关系。  
项目中涉及的名称或元素仅为个人兴趣的引用，如权利人认为有不当之处，请联系作者（`yuqu.2233@gmail.com`），我会及时调整或移除相关内容。

## 📄 许可证

本项目使用 MIT 许可证，详见 [LICENSE](./LICENSE)。

---

Made with ❤️ using Electron, Vite and React.
