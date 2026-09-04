<div align="center">
	<img src="public/icon.png" alt="Chobits Logo" width="120" height="120" />
	<h1>Chobits</h1>
	<p><b>ちぃ～</b> あなたの AI デスクトップ妖精 / アシスタント / ツール</p>
	<p>Electron・Vite・React で作られた AI デスクトップアシスタント。クロスプラットフォーム、拡張可能、プライバシー第一。</p>
	<p>
		<a href="./README.md">简体中文</a> ｜ <a href="./README.ja.md">日本語</a>
	</p>
	<p>
		<a href="https://madewithlove.org.in"><img alt="Made with Love" src="https://img.shields.io/badge/Made%20with-Love-ff69b4.svg"></a>
		<a href="https://github.com/chenxin199305/Chobits-Chi-Mascot"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-Chobits-181717?logo=github"></a>
		<a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-green.svg"></a>
	</p>
	<p>
		<img alt="Node" src="https://img.shields.io/badge/Node-%E2%89%A518.x-339933?logo=node.js&logoColor=white" />
		<img alt="Electron" src="https://img.shields.io/badge/Electron-39-blue?logo=electron&logoColor=white" />
		<img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" />
		<img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" />
	</p>
</div>

> 💖 このプロジェクトがお役に立ったら、ぜひ [GitHub](https://github.com/chenxin199305/Chobits-Chi-Mascot) で Star をお願いします —— あなたの応援が、ちぃをもっと多くの人に届けます！

## ✨ 機能一覧

- **Live2D デスクトップ妖精**
  - 透明でボーダーレスなデスクトップ妖精。デフォルトは Live2D レンダリング（動画スプライトにも対応）。
  - trigger アニメーション、発話時のリップシンク、視線追跡、クリックへの反応に対応。
  - キャラクターパック管理：インストール、切り替え、整合性チェック。

- **マルチプロバイダー AI チャット**
  - OpenAI、Anthropic、Gemini、DeepSeek、Qwen、Zhipu、Kimi、Ollama、vLLM などに対応。API キーを一元管理し、いつでも切り替えたり、会話ごとに異なるモデルを選んだりできます。
  - マルチセッション、キャラクタープリセット（システムプロンプト）、コンテキスト管理に対応。

- **音声機能**
  - Edge TTS 読み上げ：ちぃが返信を声に出して読みます。
  - AI Provider TTS：MiniMax `speechSynthesis` による合成とリアルタイム PCM ストリーミング読み上げに対応（AI の返信を生成しながら再生）。
  - 長押し話しかけ：マイクボタンを押している間話し、離すと自動で認識・送信。キャンセルボタンへスライドするとキャンセルできます。
  - 録音・文字起こし（ASR）：ローカルの sherpa-onnx によるオフライン認識、またはクラウド transcribe。
  - リアルタイム音声認識と翻訳（ASR シーンで翻訳先の言語を設定可能）。

- **キャラクターパック編集**
  - キャラクターパックマネージャー / エディター（CharacterPackManager / CharacterPackEditor）、キャラクターギャラリー（CharacterGallery）を内蔵。
  - ウィンドウアニメーションエディター（WindowAnimationEditor）で、妖精の動きや演出を編成できます。

- **グローバルショートカットと補助機能**
  - システムレベルのショートカット：アシスタントの呼び出し、メインウィンドウの表示切替、スクリーンショットなど（設定で変更可能）。
  - 右クリックメニューから素早く操作。設定ページではプロバイダー、ショートカット、テーマ、プロキシ、データベースバックアップなどをカバー。

## 💡 主な利用シーン

- **デスクトップ妖精との暮らし**：デスクトップの片隅に住むちぃ。待機したり、歩き回ったり、挨拶したり。つつけば反応し、暇なときは自分から何か始めることも。
- **すぐ呼べる AI チャット**：コーディング、ライティング、翻訳、調べもの —— ショートカットでアシスタントを呼び出して、終わったらしまうだけ。会話ごとにモデルやキャラクタープリセットを変えられます。
- **音声の文字起こしと読み上げ**：録音をリアルタイムでテキスト化（ローカルのオフライン or クラウド）。会議、インタビュー、思いつきのメモに。返信は Edge TTS で読み上げて、目を休めましょう。

## 🚀 クイックスタート

### 前提条件

| 依存      | バージョン       | 説明                                                                                                          |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Node.js   | ≥ 18（LTS 推奨） | 実行とビルド                                                                                                  |
| pnpm      | ≥ 10             | `pnpm-workspace.yaml` が `allowBuilds` フィールドを使用するため、pnpm 10 以上が必要                           |
| Xcode CLT | macOS のみ       | ネイティブモジュールのコンパイル                                                                              |
| libsecret | Linux のみ       | `keytar` が API キーの保存に必要。デスクトップ版ディストリビューションには通常同梱（gnome-keyring / KWallet） |

### 3 ステップでちぃをお迎え

```bash
# 1. クローン
git clone <your-repo-url> && cd Chobits-Chi-Mascot

# 2. 依存関係のインストール（postinstall で Electron 用ネイティブモジュールを自動リビルド）
pnpm install

# 3. 開発モードを起動（Vite + Electron が自動で立ち上がります）
pnpm dev
```

> **ちぃのヒント (・ω・)ノ**：依存関係のインストールには必ず **pnpm 10+** を使ってください。
> このリポジトリは `pnpm-workspace.yaml` の `allowBuilds` ホワイトリストで、インストールスクリプトの
> 実行を許可する依存（better-sqlite3、keytar、sharp など）を制御しています。
> 古い pnpm ではこのフィールドが認識されず、ネイティブモジュールのビルドに失敗することがあります。

### パッケージング

```bash
pnpm build    # release/<version>/ に出力、現在のプラットフォーム向けインストーラーを生成
```

- macOS：`dmg` / `zip`
- Windows：`nsis` インストーラー
- Linux：`AppImage` / `deb`

## 🧪 テストとチェック

```bash
pnpm test     # vitest 全量テスト
pnpm lint     # eslint + ディレクトリ境界チェック
npx tsc       # 型チェック
```

テストケースはドメインごとにディレクトリ分けされています：

```text
test/
  ai/  capability/  media/  misc/  resource/  sprite/  utils/
```

## 🗂 プロジェクト構成

```text
Chobits/
├── electron/     # メインプロセス + preload（ウィンドウ、IPC、データベース、ショートカットなど）
├── src/          # レンダラープロセス（React ページとコンポーネント、vendored live2d-sdk を含む）
├── packages/     # ドメインパッケージ：ai / common / event / plugins / sherpa / sprite-core / tts
├── resources/    # 同梱リソース（プラットフォームバイナリ、妖精素材など）
├── drizzle/      # データベースマイグレーション（drizzle-kit で生成）
├── docs/         # 各サブシステムの設計ドキュメント
├── test/         # vitest テスト（ドメイン別ディレクトリ）
└── scripts/      # ビルドとリソースダウンロードスクリプト
```

## ⚙️ 開発ルール

- **データベース変更**：まず schema 定義を変更し、`pnpm db:generate` でマイグレーションを生成します。SQL マイグレーションファイルを手書きしないでください。
- **UI コンポーネント**：shadcn の利用規約（Button アイコン、tooltip など）は [AGENTS.md](./AGENTS.md) を参照。
- **ロックファイル**：リポジトリは `pnpm-lock.yaml` をコミットして依存バージョンを固定します。npm/yarn の `package-lock.json` / `yarn.lock` のみ gitignore 対象です（`.gitignore` のコメント参照）。

## 🐧 プラットフォーム説明

| 機能                                  | macOS                              | Windows                            | Linux                                |
| ------------------------------------- | ---------------------------------- | ---------------------------------- | ------------------------------------ |
| コア機能（妖精 / チャット / 音声）    | ✅                                 | ✅                                 | ✅                                   |
| パッケージング                        | dmg / zip                          | nsis                               | AppImage / deb                       |
| グローバルショートカット              | ✅                                 | ✅                                 | X11 のみ、Wayland では利用不可       |

Linux 特記：妖精は透明なボーダーレスウィンドウのため、デスクトップコンポジターが必要です（GNOME / KDE はデフォルトで有効）。
`keytar` は API キーの保存にシステムの secret service に依存します。

## ❓ よくある質問

- **Linux で API キーが保存 / 読み出せない**
  システムで secret service（gnome-keyring または KWallet）が動作しているか確認してください。
- **Wayland セッションでグローバルショートカットが効かない**
  グローバル入力監視は X11 に依存しています。X11 セッションに切り替えてご利用ください。

## 📸 スクリーンショット

`test/screenshots/` にアプリのスクリーンショットを配置・更新して、主要機能を紹介できます。

## 📄 ライセンス

本プロジェクトは [MIT ライセンス](./LICENSE) で公開されています：

- **自由な利用**：商用利用を含め、自由に使用・複製・改変・配布できます。
- **表示の維持**：配布時は元の著作権表示とライセンス文を保持してください。
- **無保証**：ソフトウェアは「現状のまま」提供され、作者は一切の保証を負いません。
