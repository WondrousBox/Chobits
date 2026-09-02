## shadcn 组件使用规范

- Button组件内图标不设置 w-、 h-、mr-、ml- 这几类样式，Button会自动处理
- 我说把Button中的文本去掉保留单个图标时，就把这个文本改成tooltip展示方式
- 原本sizes="sm"的按钮如果改成只有图标，那Button的className要加 w-8 h-8

## 数据库

数据库的表字段变更升级都要优先走schema定义，再走db:generate才行

## 命名规范

### 术语分工（禁止混用）

- **sprite**：运行时桌宠 —— 渲染、动画、气泡、宠物窗口相关
- **character**：角色数据 —— 角色包、人格、画廊、角色切换相关
- 新代码禁止使用 `assistant` / `persona` / `role` 指代以上两个概念（历史遗留除外，逐步迁移）
- AI 相关缩写统一全大写：`AI` / `ASR` / `TTS`（如 `AISettings`、`useASR`）

### 大小写与后缀

- 变量/函数 camelCase；类/组件/接口/类型别名 PascalCase（不加 `I` 前缀）；常量 UPPER_SNAKE_CASE
- 类型后缀约定：`Props`（组件属性）/ `Config` / `Options`（函数与 hook 入参）/ `Payload` / `Result` / `State`
- 文件名：组件 PascalCase.tsx，hook camelCase.ts，其他模块 kebab-case.ts
- 联合类型用单数名（如 `SherpaModel`，不用 `AllModels`）

### 布尔与函数

- 布尔一律加 `is` / `has` / `should` / `can` 前缀；options 里的开关用 `searchEnabled` 形式，不用动词原形（`search`、`save`）或否定式（`disableXxx`）
- 业务事件处理器用 `handle*`；`on*` 只用于 DOM 原生事件与订阅注册
- 函数用动词开头（get/set/create/resolve/normalize/build/format/init/destroy）；销毁方法统一 `destroy()`
- 禁止无约定缩写：`cfg`/`provs`/`caps`/`fscb` 这类一律写全词；集合命名体现内容（如 `registeredAccelerators`）

### IPC 通道与事件

- 通道格式 `domain:kebab-action`，如 `sprite:anim-complete`、`preferences:get-config`；所有段一律 kebab-case，动词放最后
- 事件广播同样 kebab-case，时态统一：进行中 `-started` / `-progress`，结束 `-completed` / `-failed` / `-cancelled`
- 通道必须带命名空间（禁止裸的 `setAssistantSize`、`renderer-message` 这种）
- invoke 返回包络统一 `{ ok: boolean, ... }`，不使用 `{ success }` / `{ canceled }`

### 桥接层

- 渲染进程全局桥对象统一 `window.chobits`（历史名 `window.YUA` 已废弃）
- preload 桥接文件统一放 `electron/preload/apis/`，方法用 camelCase 语义命名，类型后缀统一 `BridgeParams` / `BridgeType`
