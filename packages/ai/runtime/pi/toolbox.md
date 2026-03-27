# 工具箱

> 本文件描述所有可用工具的详细使用方法。通过 toolboxLookupTool 按需加载。
> 每个 `##` 章节是一个技能，包含触发词、使用流程和注意事项。

## 资源查询与推送

**触发词：** 查找资源、找视频、找音频、找字幕、有没有、给我看看、最新的、查询

**涉及工具：** resourceQueryTool, pushCardTool

**工作流程：**

1. 用 resourceQueryTool 查询资源（获取 resourceId 和资源信息）
2. 用 pushCardTool 推送资源卡片到聊天窗口，让用户可以直接点击查看
3. 推送卡片时，附带简短的文字说明（text 参数）

**pushCardTool 示例：**

- 推送数据库中的资源：`pushCardTool({ type: 'video', resourceId: 'xxx', text: '这是你想要找的视频' })`
- 推送临时内容：`pushCardTool({ type: 'link', data: { id: 'temp', title: '示例', url: 'https://...' }, text: '推荐链接' })`

**注意：**

- 当用户询问资源或想要查看资源时，务必推送资源卡片，不要只用文字描述
- resourceQueryTool 支持按类型、时间、关键词等多种条件查询

---

## 字幕翻译

**触发词：** 翻译、translate、翻译字幕、翻成

**涉及工具：** resourceQueryTool, translationTool

**工作流程：**

1. 用 resourceQueryTool 查找要翻译的字幕文件（获取 resourceId）
2. 直接用 translationTool 执行翻译（只需传入 resourceId 和 targetLanguage）
3. 翻译在后台异步进行，完成后会通知用户

**注意：**

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
