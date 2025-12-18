<div align="center">
	<img src="public/icon.png" alt="Chobits Logo" width="120" height="120" />
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
  - 目标支持跨平台桌面（macOS / Windows），统一体验。

## 💡 典型使用场景

- **日常知识助手**：  
  写代码、写文案、翻译、查资料——在桌面角落随手唤起一个聊天精灵，问题问完就收起。

- **个人资料库 / 第二大脑**：  
  把看过的文章、视频、PDF、截图存成「资源」，用标签和工作区按主题整理，再用工作流跑 OCR、提要、总结。

- **内容创作流水线**：  
  为「剪视频 / 做播客 / 写博客」设计一个专用工作流：自动下载素材 → 转码 → 抽帧 / 转文字 → 生成大纲 / 文案。

- **多模型对比与调优**：  
  在一个统一的界面里配置多个模型，对同一问题同时试不同模型的效果，迭代自己的提示词模板。

## 🚀 快速开始

**前置要求：**

- Node.js ≥ 18（建议 LTS）
- 推荐包管理器：pnpm（亦可使用 npm / yarn）
- macOS 需安装 Xcode Command Line Tools 用于原生模块编译

**安装与启动开发环境：**

```bash
pnpm install
pnpm dev
```

默认会启动 Vite 开发服务器，并自动拉起 Electron 应用（通过 `vite-plugin-electron`）。

如需构建安装包、运行测试或深入开发，可参考源码中的脚本与注释，或自行阅读相关目录（`electron/`、`src/`、`packages/` 等），这里不再展开技术细节。

## 📸 截图

可在 `test/screenshots/` 放置或更新应用截图以展示关键功能。

## 声明

本项目为个人开发的非官方开源软件，与原作《Chobits（人形电脑天使心）》及其权利人无任何从属或合作关系。  
项目中涉及的名称或元素仅为个人兴趣的引用，如权利人认为有不当之处，请联系作者（`yuqu.2233@gmail.com`），我会及时调整或移除相关内容。

## 📄 许可证

本项目使用 MIT 许可证，详见 [LICENSE](./LICENSE)。

---

Made with ❤️ using Electron, Vite and React.
