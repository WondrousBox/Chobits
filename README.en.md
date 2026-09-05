<div align="center">
	<img src="public/icon.png" alt="Chobits Logo" width="120" height="120" />
	<h1>Chobits</h1>
	<p><b>Chii~</b> Your AI desktop sprite / assistant / tool</p>
	<p>An AI desktop assistant built with Electron, Vite, and React: cross-platform, extensible, privacy-first.</p>
	<p>
		<a href="./README.md">简体中文</a> ｜ <a href="./README.ja.md">日本語</a> ｜ <a href="./README.en.md">English</a>
	</p>
	<p>
		<a href="https://madewithlove.org.in"><img alt="Made with Love" src="https://img.shields.io/badge/Made%20with-Love-ff69b4.svg"></a>
		<a href="https://github.com/chenxin199305/Chobits-Chii-Mascot"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-Chobits-181717?logo=github"></a>
		<a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-green.svg"></a>
	</p>
	<p>
		<img alt="Node" src="https://img.shields.io/badge/Node-%E2%89%A520.x-339933?logo=node.js&logoColor=white" />
		<img alt="Electron" src="https://img.shields.io/badge/Electron-39-blue?logo=electron&logoColor=white" />
		<img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" />
		<img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" />
	</p>
</div>

> 💖 If this project helps you, please give it a Star on [GitHub](https://github.com/chenxin199305/Chobits-Chii-Mascot) — your support helps more people discover Chii!

## ✨ Features

- **Live2D Desktop Sprite**
  - A transparent, borderless desktop sprite rendered with Live2D by default (video sprites are also supported).
  - Supports trigger animations, lip-sync while speaking, gaze tracking, and click feedback.
  - Character pack management: install, switch, and validate sprite character packs.

- **Multi-Provider AI Chat**
  - Works with OpenAI, Anthropic, Gemini, DeepSeek, Qwen, Zhipu, Kimi, Ollama, vLLM, and more. Manage API keys in one place; switch providers anytime or pick a different model per conversation.
  - Multi-session support, character presets (system prompts), and context management.

- **Voice Capabilities**
  - Edge TTS read-aloud: let Chii read replies out loud.
  - AI Provider TTS: MiniMax `speechSynthesis` synthesis plus real-time PCM streaming playback (the AI reply plays while it's still being generated).
  - Push-to-talk: hold the mic button to speak, release to auto-recognize and send, slide to the cancel button to cancel.
  - Recording & transcription (ASR): local offline recognition with sherpa-onnx, or cloud-based transcribe.
  - Real-time speech recognition and translation (translation target language configurable in ASR scenarios).

- **Character Pack Editing**
  - Built-in character pack manager and editor (CharacterPackManager / CharacterPackEditor) and character gallery (CharacterGallery).
  - Window Animation Editor (WindowAnimationEditor) for choreographing the sprite's movements and performances.

- **Global Shortcuts & Extras**
  - System-level shortcuts: summon the assistant, toggle the main window, etc. (configurable in settings).
  - Quick actions via the right-click menu; the settings page covers providers, shortcuts, theme & appearance, network proxy, database backup, and more.

## 💡 Typical Use Cases

- **Desktop sprite companionship**: a little Chii living in the corner of your desktop — idling, wandering around, saying hello. Poke her and she reacts; when bored, she finds something to do on her own.
- **AI chat at your fingertips**: coding, copywriting, translation, research — summon the assistant with a hotkey, ask, and tuck it away. Different conversations can use different models and character presets.
- **Transcription & read-aloud**: transcribe recordings in real time (local offline or cloud) — meetings, interviews, quick notes. Replies are read out with Edge TTS, giving your eyes a rest.

## 🚀 Quick Start

### Prerequisites

| Dependency | Version                | Notes                                                                                                        |
| ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Node.js    | ≥ 20 (LTS recommended) | Runtime & build (declared in `engines`; undici@8 requires Node ≥ 20)                                          |
| pnpm       | ≥ 11                   | `pnpm-workspace.yaml` uses the `allowBuilds` field, which requires pnpm 11+                                    |
| Xcode CLT  | macOS only             | Compiling native modules                                                                                     |
| libsecret  | Linux only             | Required by `keytar` to store API keys; usually bundled with desktop distributions (gnome-keyring / KWallet) |

### Bring Chii Home in Three Steps

```bash
# 1. Clone
git clone <your-repo-url> && cd Chobits-Chii-Mascot

# 2. Install dependencies (postinstall automatically rebuilds native modules for Electron)
pnpm install

# 3. Start dev mode (Vite + Electron launch automatically)
pnpm dev
```

> **Chii's tip (・ω・)ノ**: be sure to install dependencies with **pnpm 11+** — the repo
> controls which dependencies are allowed to run install scripts via the `allowBuilds`
> whitelist in `pnpm-workspace.yaml` (better-sqlite3, keytar, sharp, etc.).
> Older pnpm versions don't recognize this field and native modules may fail to build.

### Packaging

```bash
# Prerequisite: download the 7zip binaries into resources/7zip (not committed; bundled as extraResources when packaging)
pnpm download-7zip

pnpm build    # outputs to release/<version>/ and generates installers for the current platform
```

- macOS: `dmg` / `zip`
- Windows: `nsis` installer
- Linux: `AppImage` / `deb`

## 🧪 Tests & Checks

```bash
pnpm test     # full vitest suite
pnpm lint     # eslint + directory boundary check
npx tsc       # type check
```

Test cases are organized into directories by domain:

```text
test/
  ai/  capability/  media/  misc/  resource/  sprite/  utils/
```

## 🗂 Project Structure

```text
Chobits/
├── electron/     # main process + preload (windows, IPC, database, shortcuts, etc.)
├── src/          # renderer process (React pages & components, includes vendored live2d-sdk)
├── packages/     # domain packages: ai / common / event / plugins / sherpa / sprite-core / tts
├── resources/    # bundled resources (platform binaries, sprite assets, etc.)
├── drizzle/      # database migrations (generated by drizzle-kit)
├── docs/         # design docs for each subsystem
├── test/         # vitest tests (organized by domain)
└── scripts/      # build & resource download scripts
```

## ⚙️ Development Conventions

- **Database changes**: update the schema definition first, then run `pnpm db:generate` to generate the migration — never hand-write SQL migration files.
- **UI components**: see [AGENTS.md](./AGENTS.md) for shadcn usage rules (Button icons, tooltips, etc.).
- **Lockfiles**: the repo commits `pnpm-lock.yaml` to pin dependency versions; only npm/yarn `package-lock.json` / `yarn.lock` are git-ignored (see the comment in `.gitignore`).

## 🐧 Platform Notes

| Capability                              | macOS     | Windows   | Linux                          |
| --------------------------------------- | --------- | --------- | ------------------------------ |
| Core features (sprite / chat / voice)   | ✅        | ✅        | ✅                             |
| Packaging                               | dmg / zip | nsis      | AppImage / deb                 |
| Global shortcuts                        | ✅        | ✅        | X11 only; unavailable on Wayland |

Linux notes: the sprite is a transparent, borderless window and requires a desktop compositor (enabled by default in GNOME / KDE);
`keytar` relies on the system secret service to store API keys.

## ❓ FAQ

- **API keys can't be saved / read on Linux**
  Make sure a secret service (gnome-keyring or KWallet) is running on your system.
- **Global shortcuts don't work in a Wayland session**
  Global input listening depends on X11 — please switch to an X11 session.

## 📸 Screenshots

You can place or update app screenshots in `test/screenshots/` to showcase key features.

## 🙏 Acknowledgments & References

This project is inspired by or benefits from the following open-source projects:

- [WondrousBox/Chobits](https://github.com/WondrousBox/Chobits) —— the predecessor and inspiration of this project; the core desktop-pet interaction and Live2D gameplay originated here.
- [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) —— a key reference for the voice interaction pipeline (ASR → LLM → TTS) and sherpa-onnx model selection.
- [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) —— the local speech recognition and synthesis engine (runtime for SenseVoice / Kokoro and other models).
- [RVC-Boss/GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) —— voice cloning and synthesis; the default voice backend for character speech.

## 📄 License

This project is released under the [MIT License](./LICENSE):

- **Free to use**: use, copy, modify, and distribute freely, including for commercial purposes.
- **Keep the notices**: retain the original copyright and license notice when distributing.
- **No warranty**: the software is provided "as is"; the author accepts no liability of any kind.
