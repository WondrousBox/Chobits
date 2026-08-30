# 工具箱

> 本文件描述所有可用工具的详细使用方法。通过 toolboxLookupTool 按需加载。
> 每个 `##` 章节是一个技能，包含触发词、使用流程和注意事项。

## 资源字幕链路

**触发词：** 看不懂视频、帮我理解视频、转写翻译、视频转写翻译、字幕链路、media chain

**涉及工具：** workflowRunTool, translationTool

**工作流程：**

1. 用户想理解已有视频/音频资源时，先规划完整链路：转写/提取字幕 -> 翻译字幕。
2. 调用 `workflowRunTool` 搜索或执行转写工作流。执行时传入 `input: { resourceId: 目标资源ID }`，并优先 `waitForCompletion: true`。
3. 转写完成后必须使用 `workflowRunTool` 返回的 `outputResourceId`、`next.resourceId`、`createdResources[0].id` 或 `producedResourceIds[0]` 作为新字幕资源 ID。
4. 调用 `translationTool({ resourceId: 上一步转写得到的字幕资源ID, targetLanguage, waitForCompletion: true })`。

**关键规则：**

- 刚由工具创建或返回的资源 ID 是权威链路状态。只要上一步结果里有 `resourceId`、`outputResourceId`、`createdResources`、`producedResourceIds` 或 `next.resourceId`，就必须直接传给下一步。
- 不要为了继续处理刚转写出来的资源而调用 `resourceQueryTool`。
- 只有在用户要处理“已有资源”，且当前对话没有确切资源 ID 时，才使用 `resourceQueryTool`。
- 不要用视频标题、文件名或同名字幕搜索来猜测下一步输入；这会误命中历史同名资源。
- 如果转写被切到后台，当前链路不能继续执行依赖产物的下一步，除非后续能拿到明确的产物 ID。

---

## 资源查询与推送

**触发词：** 查找资源、找视频、找音频、找字幕、预览资源、打开资源、查看资源、播放资源、打开文件、预览文件、有没有、给我看看、最新的、查询

**涉及工具：** resourceQueryTool, pushCardTool, appWindowTool

**工作流程：**

1. 用户要找资源时，用 resourceQueryTool 查询资源（获取 resourceId 和资源信息）。
2. 查询到资源后，用 pushCardTool 推送资源卡片到聊天窗口，让用户可以直接点击查看。
3. 如果用户明确说“打开/预览/查看/播放某个具体资源”，在拿到 resourceId 后搜索应用窗口能力：`toolboxTool({ action: 'search', query: '预览资源 打开资源' })`，再用 appWindowTool 打开 `resourcePreview` 并传 `{ resourceId }`。
4. 如果用户想进入资源库浏览或管理资源，搜索应用窗口能力后用 appWindowTool 打开 `resources`。
5. 推送卡片时，附带简短的文字说明（text 参数）。

**pushCardTool 示例：**

- 推送数据库中的资源：`pushCardTool({ type: 'video', resourceId: 'xxx', text: '这是你想要找的视频' })`
- 推送临时内容：`pushCardTool({ type: 'link', data: { id: 'temp', title: '示例', url: 'https://...' }, text: '推荐链接' })`

**注意：**

- 当用户询问资源或想要查看资源时，务必推送资源卡片，不要只用文字描述
- 如果上一轮工具刚返回了 `resourceId`、`outputResourceId`、`createdResources` 或 `next.resourceId`，后续处理必须直接使用这些 ID，不要再用 resourceQueryTool 按标题搜索同一个资源
- “给我看看有哪些资源/找一下资源”偏查询和卡片；“打开这个资源/预览这个视频/播放这段音频/查看这张图片”偏窗口预览，应使用 appWindowTool
- resourceQueryTool 支持按类型、时间、关键词等多种条件查询

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

**适用工具：** `translationTool`、`summaryTool`、`workflowRunTool`

**使用原则：**

1. 这些长任务工具现在都支持“等待完成并持续展示进度”。
2. 如果后续 AI 推理依赖最终结果，优先等待完成再继续后续循环。
3. 如果不需要阻塞当前对话，可以显式传 `waitForCompletion: false`，立即转为后台执行。
4. 当工具处于等待模式时，UI 会实时展示百分比和状态文本，并允许用户随时点击“转为后台执行”。
5. 一旦用户切到后台，当前等待会结束，但任务本身仍会继续运行；返回结果里会保留 `taskId`、`requestId` 或 `runId` 供后续查询。
