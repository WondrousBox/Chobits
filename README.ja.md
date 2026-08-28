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

> 💖 このプロジェクトがお役に立ったら、ぜひ [GitHub](https://github.com/WondrousBox/Chobits) で Star をお願いします —— あなたの応援が、ちぃをもっと多くの人に届けます！

## ✨ 機能一覧

- **マルチモデル / マルチプロバイダー対応**
  OpenAI、Anthropic、Gemini、DeepSeek、Qwen、Zhipu、Ollama などのプロバイダーに対応。アプリ内で API キーを一元管理し、いつでも切り替えたり、会話ごとに異なるモデルを選んだりできます。

- **デスクトップ妖精型チャットアシスタント**
  - デスクトップに浮かぶ小さな妖精スタイルで、いつでも会話を呼び出せます。
  - マルチセッション、複数のシステムプロンプト（キャラクタープリセット）、コンテキスト管理に対応。
  - 返信のコピー、整形、続きの執筆、推敲などをワンクリックで。

- **リソース・ナレッジベース管理**
  - Web ページ、ドキュメント、音声・動画、スクリーンショットなどを「リソース」として集めて一元管理。
  - タグ、ワークスペース、ゴミ箱に対応し、テーマやプロジェクトごとに整理できます。
  - リソース詳細ページではプレビュー、再生、関連するワークフロータスクの結果確認が可能です。

- **メディア処理とダウンロード**
  - ffmpeg と yt-dlp の連携機能を内蔵し、動画 / 音声をダウンロードして自動で整理できます。
  - トランスコード、フレーム抽出、圧縮などの一般的な処理をワークフローからワンクリックで実行。

- **ワークフローと自動化（ビジュアル）**
  - キャンバス上でノードをドラッグして「Start → 処理ノード → 表示 / 出力」のフローを構築。
  - OCR、トランスコード、ドキュメントの Markdown 変換、AI 生成 / 理解、マルチメディア表示などのノードを内蔵。
  - プリセットワークフローと履歴表示に対応し、再利用やトラブルシューティングが簡単です。

- **プラグインと拡張機能**
  - プラグイン管理ページで ffmpeg / Tesseract / Whisper などの機能を確認 / インストール / 更新できます。
  - ワークフロー、ダウンロード、リソース処理向けに新しいノードや機能を拡張可能。

- **タグと自動化ルール**
  - リソースにタグを付け、ワークスペースを作成して、プロジェクトや生活領域ごとに区別できます。
  - 自動化ルールにより、ファイルの出所・種類・名前などの条件に応じて自動でタグ付けやワークスペースへの振り分けが可能。

- **グローバルショートカットと補助機能**
  - システムレベルのショートカットで、アシスタントの呼び出しやリソースのお気に入り登録などを素早く実行（設定で変更可能）。
  - スクリーンショットウィンドウ、ダウンロードフローティングウィンドウなどの補助ページで、日常の操作を Chobits に取り込みやすくします。

- **自動更新とクロスプラットフォーム**
  - 自動更新機能を内蔵し、常に最新の状態を維持。
  - macOS / Windows / Linux の 3 つのデスクトッププラットフォームを統一した体験でサポート。

## 💡 主な利用シーン

- **日常の知識アシスタント**：コーディング、ライティング、翻訳、調べもの —— デスクトップの片隅からチャット妖精を呼び出して、終わったらしまうだけ。
- **個人ナレッジベース / セカンドブレイン**：読んだ記事、動画、PDF、スクリーンショットを「リソース」として保存し、タグとワークスペースでテーマごとに整理。ワークフローで OCR、要約、まとめを実行。
- **コンテンツ制作パイプライン**：「動画編集 / ポッドキャスト / ブログ」用のワークフローを設計：素材の自動ダウンロード → トランスコード → フレーム抽出 / 文字起こし → アウトライン / 文案の生成。
- **マルチモデルの比較とチューニング**：統一された UI で複数のモデルを設定し、同じ質問で効果を比較しながら、プロンプトテンプレートを改善。

## 🚀 クイックスタート

### 前提条件

| 依存 | バージョン | 説明 |
| --- | --- | --- |
| Node.js | ≥ 18（LTS 推奨） | 実行とビルド |
| pnpm | 9.x | **Node 18 の方は `pnpm@9` をインストール**（最新版 pnpm は Node ≥ 22 が必要）：`npm i -g pnpm@9` |
| Xcode CLT | macOS のみ | ネイティブモジュールのコンパイル |
| libsecret | Linux のみ | `keytar` が API キーの保存に必要。デスクトップ版ディストリビューションには通常同梱（gnome-keyring / KWallet） |

### 3 ステップでちぃをお迎え

```bash
# 1. クローン
git clone <your-repo-url> && cd Chobits

# 2. 依存関係のインストール（postinstall で Electron 用ネイティブモジュールを自動リビルド）
pnpm install

# 3. 開発モードを起動（Vite + Electron が自動で立ち上がります）
pnpm dev
```

> **ちぃのヒント (・ω・)ノ**：`pnpm install` が `onnxruntime-node` の postinstall で止まる場合
>（CUDA ダウンロードスクリプトが 302 リダイレクトを処理しません）、スキップして OK です。CPU 版バイナリはパッケージに同梱済み：
>
> ```bash
> ONNXRUNTIME_NODE_INSTALL=skip pnpm install
> ```

### オプション：プラットフォーム別リソースバイナリのダウンロード

以下の機能は同梱のサードパーティバイナリに依存します。プラットフォームに応じたスクリプトを実行してください（「プラグイン管理」ページから必要に応じてインストールすることも可能）：

| プラットフォーム | コマンド |
| --- | --- |
| macOS (Apple Silicon) | `pnpm download-ffmpeg-darwin-arm64` `pnpm download-ytdlp-darwin` `pnpm download-bun-darwin-arm64` |
| macOS (Intel) | `pnpm download-bun-darwin-x64` |
| Windows | `pnpm download-ffmpeg-win32-x64` `pnpm download-ytdlp-win32` `pnpm download-bun-win32-x64` |
| Linux | `pnpm download-linux-resources` `pnpm download-bun-linux-x64` |

ダウンロードしなくても起動とチャットは正常に使えます。動画ダウンロード / トランスコード、一部のプラグイン、画面録画などの機能が使えないだけです。

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
pnpm lint     # eslint
npx tsc       # 型チェック
```

テストケースはドメインごとにディレクトリ分けされています（`docs/` のシステム区分と一対一対応）：

```text
test/
  ai/  sprite/  memory/  media/  workflow/  resource/
  scheduler/  capability/  persona/  onboarding/  analytics/  misc/
```

## 🗂 プロジェクト構成

```text
Chobits/
├── electron/     # メインプロセス + preload（ウィンドウ、IPC、データベース、ショートカットなど）
├── src/          # レンダラープロセス（React ページとコンポーネント）
├── packages/     # ドメインパッケージ：ai / workflow / sherpa / tts / ocr / sprite-core / plugins ...
├── resources/    # 同梱リソース（プラットフォームバイナリ、妖精素材、ワークフロープリセットなど；バイナリは上記スクリプトでダウンロード）
├── drizzle/      # データベースマイグレーション（drizzle-kit で生成）
├── docs/         # 各サブシステムの設計ドキュメント
├── test/         # vitest テスト（ドメイン別ディレクトリ）
└── scripts/      # ビルドとリソースダウンロードスクリプト
```

## ⚙️ 開発ルール

- **データベース変更**：まず schema 定義を変更し、`pnpm db:generate` でマイグレーションを生成します。SQL マイグレーションファイルを手書きしないでください。
- **UI コンポーネント**：shadcn の利用規約（Button アイコン、tooltip など）は [AGENTS.md](./AGENTS.md) を参照。
- **ロックファイル**：リポジトリに lockfile をコミットしません（`pnpm-lock.yaml` などは gitignore 済み、upstream の CI も受け付けません）。

## 🐧 プラットフォーム説明

| 機能 | macOS | Windows | Linux |
| --- | --- | --- | --- |
| コア機能（会話 / リソース / ワークフロー） | ✅ | ✅ | ✅ |
| メディアダウンロード / トランスコード | ✅ | ✅ | ✅（ダウンロードスクリプトの実行が必要） |
| パッケージング | dmg / zip | nsis | AppImage / deb |
| グローバルショートカット / テキスト選択 | ✅ | ✅ | X11 のみ、Wayland では利用不可 |

Linux 特記：妖精は透明なボーダーレスウィンドウのため、デスクトップコンポジターが必要です（GNOME / KDE はデフォルトで有効）。
`keytar` は API キーの保存にシステムの secret service に依存します。

## ❓ よくある質問

- **`pnpm install` で `onnxruntime-node` のダウンロードに失敗（HTTP 302）**
  `ONNXRUNTIME_NODE_INSTALL=skip pnpm install` を使ってください。上記「ちぃのヒント」を参照。
- **起動時に `VERS_1.21.0 not found` のような onnxruntime シンボルエラー**
  リポジトリは `package.json` の pnpm overrides で onnxruntime-node のバージョンを統一済みです。必ず **pnpm**（npm ではなく）で依存関係をインストールしてください。overrides が有効になります。
- **Linux で API キーが保存 / 読み出せない**
  システムで secret service（gnome-keyring または KWallet）が動作しているか確認してください。
- **Wayland セッションでグローバルショートカットが効かない**
  グローバル入力監視は X11 に依存しています。X11 セッションに切り替えてご利用ください。

## 📸 スクリーンショット

`test/screenshots/` にアプリのスクリーンショットを配置・更新して、主要機能を紹介できます。

## 免責事項

本プロジェクトは個人が開発した非公式のオープンソースソフトウェアであり、原作《Chobits（ちょびっツ）》およびその権利者とは一切の所属・提携関係がありません。
プロジェクト内の名称や要素は個人の趣味による引用です。権利者から不適切とのご指摘があった場合は、作者（`yuqu.2233@gmail.com`）までご連絡ください。速やかに調整・削除いたします。

## 📄 ライセンス

本プロジェクトは [MIT ライセンス](./LICENSE) で公開されています：

- **自由な利用**：商用利用を含め、自由に使用・複製・改変・配布できます。
- **表示の維持**：配布時は元の著作権表示とライセンス文を保持してください。
- **無保証**：ソフトウェアは「現状のまま」提供され、作者は一切の保証を負いません。
