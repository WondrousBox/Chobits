# 工具箱

> 本文件描述所有可用工具的详细使用方法。通过 toolboxLookupTool 按需加载。
> 每个 `##` 章节是一个技能，包含触发词、使用流程和注意事项。

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

**适用工具：** `translationTool`、`summaryTool`

**使用原则：**

1. 这些长任务工具现在都支持“等待完成并持续展示进度”。
2. 如果后续 AI 推理依赖最终结果，优先等待完成再继续后续循环。
3. 如果不需要阻塞当前对话，可以显式传 `waitForCompletion: false`，立即转为后台执行。
4. 当工具处于等待模式时，UI 会实时展示百分比和状态文本，并允许用户随时点击“转为后台执行”。
5. 一旦用户切到后台，当前等待会结束，但任务本身仍会继续运行；返回结果里会保留 `taskId`、`requestId` 或 `runId` 供后续查询。
