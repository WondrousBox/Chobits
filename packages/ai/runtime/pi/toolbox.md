# 工具箱

> 本文件描述所有可用工具的详细使用方法。通过 toolboxLookupTool 按需加载。
> 每个 `##` 章节是一个技能，包含触发词、使用流程和注意事项。

## 卡片推送

**触发词：** 给我看看、推送卡片、推荐、分享链接

**涉及工具：** pushCardTool

**工作流程：**

1. 需要把内容以卡片形式呈现给用户时，用 pushCardTool 推送卡片到聊天窗口。
2. 推送卡片时，附带简短的文字说明（text 参数）。

**pushCardTool 示例：**

- 推送临时内容：`pushCardTool({ type: 'link', data: { id: 'temp', title: '示例', url: 'https://...' }, text: '推荐链接' })`

**注意：**

- 当用户想要查看内容时，务必推送资源卡片，不要只用文字描述

---

## 网络搜索与网页读取

**触发词：** 搜索、查一下、搜一下、最新、新闻、网页、总结一下这个链接、search、web

**涉及工具：** webSearchTool, webReadTool

**工作流程：**

1. 用户要查最新信息或资料时，用 webSearchTool 搜索互联网获取结果。
2. 用户给出具体链接或需要阅读网页全文时，用 webReadTool 读取指定网页的内容。

**注意：**

- 搜索到结果后如需正文细节，再用 webReadTool 读取具体链接
- 读取网页失败时不要编造内容，如实告知用户

---

## 应用窗口

**触发词：** 打开窗口、打开设置、设置、聊天窗口、助手窗口、语音识别、语音合成、窗口动画、角色包编辑、window、settings、chat

**涉及工具：** appWindowTool

**工作流程：**

1. 用户要求打开 chobits 内的业务窗口时，先用 appWindowTool 的 search 按自然语言查找窗口；不确定有哪些窗口时用 list。
2. open 时只传 search/list 返回的 windowKey，不要猜内部窗口 key。
3. payload 只能传该窗口说明中列出的字段；工具会自动丢弃未知或不合法字段。
4. 打开设置页时优先传 `{ category: "ai" | "plugins" | "shortcuts" | ... }`；打开聊天类窗口时可传 `initialMessage`。

**注意：**

- 这个工具只开放业务窗口，不开放气泡、精灵特效、菜单浮层、下载浮窗等内部系统窗口。
- 如果用户只是想查看窗口能力，用 list/search；只有明确要打开窗口时才 open。
- appWindowTool 的 search/list 返回每个窗口能接收的 payload 字段，打开前先看返回说明。
- 打开窗口属于 UI 副作用，来自高风险 skill 的调用需要按运行时确认机制处理。
