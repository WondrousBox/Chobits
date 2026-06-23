# 工具箱

> 本文件描述所有可用工具的详细使用方法。通过 toolboxLookupTool 按需加载。
> 每个 `##` 章节是一个技能，包含触发词、使用流程和注意事项。

## 链式资源处理

**触发词：** 看不懂视频、看不懂链接、帮我理解视频、下载转写翻译、下载视频并翻译、视频转写翻译、YouTube 转写翻译、字幕链路、media chain

**涉及工具：** youtubeDownloadTool, workflowRunTool, translationTool

**工作流程：**

1. 用户给 YouTube 链接并表达“看不懂、帮我理解、翻译一下、做字幕”等意图时，先规划完整链路：下载视频 -> 转写/提取字幕 -> 翻译字幕。
2. 调用 `youtubeDownloadTool({ url, waitForCompletion: true })`，等待下载完成。
3. 下载完成后必须使用工具返回的 `resourceId`、`resource.id` 或 `next.resourceId` 作为新视频资源 ID，不要按标题搜索资源。
4. 调用 `workflowRunTool` 搜索或执行转写工作流。执行时传入 `input: { resourceId: 上一步下载得到的视频资源ID }`，并优先 `waitForCompletion: true`。
5. 转写完成后必须使用 `workflowRunTool` 返回的 `outputResourceId`、`next.resourceId`、`createdResources[0].id` 或 `producedResourceIds[0]` 作为新字幕资源 ID。
6. 调用 `translationTool({ resourceId: 上一步转写得到的字幕资源ID, targetLanguage, waitForCompletion: true })`。

**关键规则：**

- 刚由工具创建或返回的资源 ID 是权威链路状态。只要上一步结果里有 `resourceId`、`outputResourceId`、`createdResources`、`producedResourceIds` 或 `next.resourceId`，就必须直接传给下一步。
- 不要为了继续处理刚下载或刚转写出来的资源而调用 `resourceQueryTool`。
- 只有在用户要处理“已有资源”，且当前对话没有确切资源 ID 时，才使用 `resourceQueryTool`。
- 不要用视频标题、文件名或同名字幕搜索来猜测下一步输入；这会误命中历史同名资源。
- 如果下载或转写被切到后台，当前链路不能继续执行依赖产物的下一步，除非后续能拿到明确的产物 ID。

---

## 资源查询与推送

**触发词：** 查找资源、创建资源、保存资源、导入资源、找视频、找音频、找字幕、预览资源、打开资源、查看资源、播放资源、打开文件、预览文件、有没有、给我看看、最新的、查询

**涉及工具：** resourceQueryTool, resourceCreateTool, pushCardTool, appWindowTool

**工作流程：**

1. 用户要找资源时，用 resourceQueryTool 查询资源（获取 resourceId 和资源信息）。
2. 用户要把本地文件、URL 或文本保存到资源库时，用 resourceCreateTool 创建资源。
3. 创建或查询到资源后，用 pushCardTool 推送资源卡片到聊天窗口，让用户可以直接点击查看。
4. 如果用户明确说“打开/预览/查看/播放某个具体资源”，在拿到 resourceId 后搜索应用窗口能力：`toolboxTool({ action: 'search', query: '预览资源 打开资源' })`，再用 appWindowTool 打开 `resourcePreview` 并传 `{ resourceId }`。
5. 如果用户想进入资源库浏览或管理资源，搜索应用窗口能力后用 appWindowTool 打开 `resources`。
6. 推送卡片时，附带简短的文字说明（text 参数）。

**pushCardTool 示例：**

- 推送数据库中的资源：`pushCardTool({ type: 'video', resourceId: 'xxx', text: '这是你想要找的视频' })`
- 推送临时内容：`pushCardTool({ type: 'link', data: { id: 'temp', title: '示例', url: 'https://...' }, text: '推荐链接' })`

**注意：**

- 当用户询问资源或想要查看资源时，务必推送资源卡片，不要只用文字描述
- 如果上一轮工具刚返回了 `resourceId`、`outputResourceId`、`createdResources` 或 `next.resourceId`，后续处理必须直接使用这些 ID，不要再用 resourceQueryTool 按标题搜索同一个资源
- “给我看看有哪些资源/找一下资源”偏查询和卡片；“打开这个资源/预览这个视频/播放这段音频/查看这张图片”偏窗口预览，应使用 appWindowTool
- resourceQueryTool 支持按类型、时间、关键词等多种条件查询
- resourceCreateTool 的 `mediaKind: "music"` 会把资源标记为音乐：资源类型仍是 `audio`，但 metadata 中会写入 `mediaKind/kind: "music"`，并添加 music 标签/分类

---

## 字幕翻译

**触发词：** 翻译、translate、翻译字幕、翻成

**涉及工具：** resourceQueryTool, translationTool

**工作流程：**

1. 如果上一轮转写工作流刚返回 `outputResourceId`、`next.resourceId`、`createdResources[0].id` 或 `producedResourceIds[0]`，直接把这个字幕资源 ID 传给 translationTool。
2. 只有在没有明确字幕 ID、且用户是在处理已有字幕资源时，才用 resourceQueryTool 查找要翻译的字幕文件（获取 resourceId）。
3. 直接用 translationTool 执行翻译（只需传入 resourceId 和 targetLanguage）。
4. 翻译在后台异步进行，完成后会通知用户。

**注意：**

- 刚由转写工作流创建的字幕，绝对不要按标题或文件名搜索；直接使用转写工具结果里的资源 ID。
- translationTool 会自动加载字幕内容，无需先调用 readSubtitleTool
- 如果用户没有指定目标语言，询问用户想要翻译成什么语言

---

## 字幕总结

**触发词：** 总结、summarize、概括、摘要

**涉及工具：** resourceQueryTool, summaryTool

**工作流程：**

1. 用 resourceQueryTool 查找要总结的字幕文件（获取 resourceId）
2. 直接用 summaryTool 执行总结（只需传入 resourceId 和 targetLanguage）
3. 总结在后台异步进行，完成后会通知用户

**注意：**

- summaryTool 会自动加载字幕内容，无需先调用 readSubtitleTool
- 如果用户没有指定目标语言，询问用户想要什么语言的总结

---

## 字幕读取

**触发词：** 读取字幕、看看字幕内容、字幕写了什么、预览字幕

**涉及工具：** readSubtitleTool

**工作流程：**

1. 用 readSubtitleTool 读取字幕文件内容
2. 返回字幕的文本内容给用户

**注意：**

- 主要用于预览字幕内容
- 翻译和总结前不需要先调用此工具

---

## YouTube 下载

**触发词：** 下载视频、download、youtube.com、youtu.be

**涉及工具：** youtubeDownloadTool

**工作流程：**

1. 识别用户消息中的 YouTube 链接（youtube.com 或 youtu.be）
2. 用 youtubeDownloadTool 下载视频（传入 url 和可选的 quality、filename 等）
3. 告诉用户"开始下载了，可以去下载管理器看进度"
4. 如果返回了 channelInfo，顺便问用户要不要订阅该频道

**注意：**

- 下载任务是异步的，立即返回不代表下载完成
- 不需要先查询资源，直接下载即可

---

## YouTube 订阅

**触发词：** 订阅频道、subscribe、关注频道

**涉及工具：** youtubeSubscribeTool

**工作流程：**

1. 用 youtubeSubscribeTool 订阅频道（传入 channelIdOrUrl）
2. 可以询问用户是否需要自动下载新视频（autoDownload 参数）
3. 订阅成功后，告诉用户频道名称和视频数量
4. 如果有 latestVideos，可以展示最新的几个视频

**注意：**

- 订阅后的视频可以在资源库的"订阅"标签中查看

---

## 记忆检索

**触发词：** 之前、上次、记得、我们聊过、你还记得吗、以前、之前说过

**涉及工具：** memorySearchTool, memoryGetTool, memoryTopicsTool

**工作流程：**

1. 用 memorySearchTool 搜索记忆（传入自然语言查询）
2. 如果没有具体关键词（如"我们聊过什么"），用 memoryTopicsTool 浏览所有主题
3. 需要详情时，用 memoryGetTool 读取具体段落内容

**关键规则：**

- 用户问起过去的对话时，**必须先搜索记忆**，不能直接说没有记忆
- 用自然的方式表达记忆结果：说"我回忆了一下"，不要说"检索了长期记忆数据库"
- 不要凭空编造记忆内容，搜索后确实没有就诚实说

---

## 记忆保存

**触发词：** 记住、帮我记一下、保存这个（显式触发）

**涉及工具：** memorySaveTool

**自主保存（无需用户要求）：**
当对话中出现以下内容时，主动保存：

- 用户的**个人偏好**（喜好、习惯、工作方式）
- 用户做出的**重要决策**（方案选型、架构决定、设计原则）
- 用户分享的**关键信息**（项目背景、团队情况、工作职责）
- 对话中的**待办事项或计划**（下一步、里程碑）
- 用户的**需求或目标**（产品需求、长期计划）
- 深入讨论后达成的**技术方案**

**不要保存：** 闲聊、问候、简单问答、纯工具指令、已保存过的重复内容

**保存要求：**

- topic：简洁准确的主题标签
- content：提炼核心要点，不逐字记录
- importance：一般偏好 0.6，重要决策 0.8，关键规划 0.9
- keywords：至少 3 个，方便检索
- 保存后简短说一句"我记住了"就行

---

## 画像即时更新

**触发词：** 无固定触发词（Agent 自主判断）

**涉及工具：** personaUpdateTool

**使用场景：**
当对话中识别到用户画像级别的重要信息，但自动画像更新尚未触发（冷却中、消息数不足等），主动调用：

- 用户明确表达了**个人偏好变化**（"我现在更喜欢用 TypeScript 了"）
- 用户透露了**新的目标或优先级**（"我最近在做一个开源项目"）
- 用户展现了**沟通风格**或**决策倾向**
- 用户分享了**近期活动变化**（"我换工作了"、"最近在学 Rust"）

**调用要求：**

- candidateFacts：提取具体的画像事实（维度 + 描述 + 置信度）
- dimension 选择：basic（基本信息）、preference（偏好）、goal（目标）、personality（个性）、decision（决策风格）、activity（近期活动）、recent（近期转变）
- confidence：确认度高用 0.8+，推测性的用 0.5~0.7
- 不要频繁调用——仅在确实发现有价值的画像信息时使用

---

## 关键记忆刷新

**触发词：** 无固定触发词（Agent 自主判断）

**涉及工具：** memoryRefreshCriticalTool

**使用场景：**
在使用 memorySaveTool 保存了高重要度笔记后，调用此工具使关键记忆立即生效：

- 刚保存了 importance ≥ 0.8 的关键偏好/决策/计划
- 需要这些信息在后续对话中立即被自动注入
- 用户明确要求"以后每次都记住这个"

**典型工作流：**

1. 先用 memorySaveTool 保存记忆（importance 设高，如 0.85+）
2. 然后调用 memoryRefreshCriticalTool 刷新 MEMORY.md
3. 告诉用户"已保存并更新到关键记忆"

**注意：** 不需要每次保存记忆都刷新——只有对话中出现的真正关键信息才值得刷新

---

## 工作流执行

**触发词：** 转写、提取字幕、OCR、文字识别、提取音频、提取关键帧、生成图片、理解图片、工作流

**涉及工具：** workflowRunTool

**工作流程：**

1. 当用户需要执行 AI 无法直接完成的任务时（如视频转文字、音频提取等），先用 workflowRunTool 的 search 或 list 查找合适的工作流
2. 确认找到合适的工作流后，用 run 执行工作流
3. 工作流在后台异步执行，告诉用户已启动

**常见场景与对应输入：**

- **视频/音频转写（语音转文字）：** 搜索"转写"或"字幕"，输入 `{ resourceId: "资源ID" }`
- **提取音频（视频转MP3）：** 搜索"音频"或"transcode"，输入 `{ resourceId: "资源ID" }`
- **图片文字识别（OCR）：** 搜索"OCR"或"文字识别"，输入 `{ resourceId: "资源ID" }`
- **提取视频关键帧：** 搜索"关键帧"或"keyframe"，输入 `{ resourceId: "资源ID" }`
- **AI 图片生成：** 搜索"生成图片"，输入 `{ text: "提示词" }`
- **理解图片内容：** 搜索"理解图片"，输入 `{ resourceId: "资源ID" }`

**注意：**

- 大多数工作流需要 resourceId 作为输入。如果上一步工具刚产生了 resourceId，必须直接使用；只有没有明确 ID 且要处理已有资源时，才用 resourceQueryTool 查找目标资源
- 工作流执行是异步的，返回 runId 不代表执行完成
- 当工作流完成结果里有 outputResourceId、createdResources、producedResourceIds 或 next.resourceId 时，这就是后续工具的输入，不要再搜索同名资源
- 如果不确定用哪个工作流，先用 list 列出所有工作流查看描述
- 如果有多个类似工作流（如多种转写引擎），可以根据描述选择合适的

---

## 音乐生成

**触发词：** 音乐生成、生成音乐、做歌、配乐、写歌、作曲、歌词、生成歌词、music、song、lyrics

**涉及工具：** musicLyricsTool, musicGenerateTool, resourceCreateTool

**工作流程：**

1. 当用户只要歌词、想先写词，或要生成有人声歌曲但没有提供歌词时，先用 musicLyricsTool 生成完整歌词。
2. 当用户想生成歌曲、配乐、纯音乐或参考音频翻唱时，再用 musicGenerateTool。
3. prompt 里尽量包含曲风、情绪、乐器、速度、人声、编曲方向；如果 musicLyricsTool 或用户给了歌词，把歌词放到 `lyrics`，并使用 `mode: "lyrics-to-song"`。
4. 如果用户要求纯音乐，传 `mode: "instrumental"` 或 `isInstrumental: true`，不要先生成歌词。
5. 如果用户给了参考音频或要求翻唱，使用 `mode: "cover"`，并传入 `referenceAudioUrl`、`referenceAudioBase64` 或 `coverFeatureId`。
6. musicGenerateTool 会等待生成完成，把音频先写入当前工作空间 `.cache/music-generation`，并默认创建音频资源和推送资源卡片。
7. 如果 musicGenerateTool 的结果没有 `resourceId`，必须继续调用 resourceCreateTool，把生成的 `audioPath` 保存为 `type: "audio"`、`mediaKind: "music"`、`aiGenerated: true` 的资源。

**注意：**

- musicLyricsTool / musicGenerateTool 走 provider 统一封装，内部调用 `PiExecutionService.generateLyrics()` / `PiExecutionService.generateMusic()`。
- 默认优先使用当前会话中支持 `musicGeneration` 的 provider；否则回落 MiniMax。需要指定其他音乐 provider 时，传 `providerId`、`providerPresetId`、`model`。
- provider 私有参数使用 `providerOptions`，工具会放进 `extras[providerId]`；MiniMax 历史参数如 `lyricsOptimizer`、`coverFeatureId` 仍可直接传。
- MiniMax 生成非纯音乐且没有传 `lyrics` 时，会自动使用 `lyricsOptimizer: true` 让 MiniMax 从 prompt 补歌词；如果用户需要精确歌词，仍应先用 musicLyricsTool 或显式传 `lyrics`。
- 需要所选 provider 具备音乐生成能力和可用 API Key。
- 这是生成音乐的工具，不是转写或提取音频工具。
- 生成的资源会标记 `mediaKind: "music"` / `kind: "music"`，并带有 `music`、`ai-generated` 等标签，后续播放器或桌面精灵可以据此识别音乐并触发跳舞等动作。

## 应用窗口

**触发词：** 打开窗口、打开设置、打开资源库、打开资源、预览资源、查看资源、播放资源、打开文件、预览文件、设置、资源库、聊天窗口、助手窗口、插件管理、窗口动画、window、settings、preview

**涉及工具：** appWindowTool

**工作流程：**

1. 用户要求打开 chobits 内的业务窗口时，先用 appWindowTool 的 search 按自然语言查找窗口；不确定有哪些窗口时用 list。
2. open 时只传 search/list 返回的 windowKey，不要猜内部窗口 key。
3. payload 只能传该窗口说明中列出的字段；工具会自动丢弃未知或不合法字段。
4. 打开设置页时优先传 `{ category: "ai" | "plugins" | "shortcuts" | ... }`；打开聊天类窗口时可传 `initialMessage`。
5. 打开或预览具体资源时，先用 resourceQueryTool 找到 resourceId，再用 appWindowTool 打开 `resourcePreview`，payload 传 `{ resourceId }`。
6. 进入资源库浏览/管理时打开 `resources`；预览单个资源时打开 `resourcePreview`，不要混用。

**注意：**

- 这个工具只开放业务窗口，不开放气泡、精灵特效、菜单浮层、下载浮窗等内部系统窗口。
- 如果用户只是想查看窗口能力，用 list/search；只有明确要打开窗口时才 open。
- appWindowTool 的 search/list 返回每个窗口能接收的 payload 字段，打开前先看返回说明。
- 打开窗口属于 UI 副作用，来自高风险 skill 的调用需要按运行时确认机制处理。

## 长任务等待与进度

**适用工具：** `translationTool`、`summaryTool`、`youtubeDownloadTool`、`workflowRunTool`

**使用原则：**

1. 这些长任务工具现在都支持“等待完成并持续展示进度”。
2. 如果后续 AI 推理依赖最终结果，优先等待完成再继续后续循环。
3. 如果不需要阻塞当前对话，可以显式传 `waitForCompletion: false`，立即转为后台执行。
4. 当工具处于等待模式时，UI 会实时展示百分比和状态文本，并允许用户随时点击“转为后台执行”。
5. 一旦用户切到后台，当前等待会结束，但任务本身仍会继续运行；返回结果里会保留 `taskId`、`requestId` 或 `runId` 供后续查询。
