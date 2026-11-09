# DeepSeek Harness 的 Telescope 搜索

一个 telescope.nvim 风格的浮动模糊查找器，适用于 DeepSeek Harness 的 Web 界面和桌面 App。
打开一个弹窗即可搜索会话标题、工作区、路径和消息正文，并在打开会话前预览命中内容。

[English](README.md)

> 社区插件，不是 DeepSeek Harness 的官方组件。

## 功能

- `shell.overlay` 中的**浮动查找器**，以及侧栏底部的 **Search** 行（侧栏折叠时显示为放大镜图标）。
- **会话模糊搜索**：匹配标题、工作区名称和路径，标题命中的权重高于工作区和路径。
- **正文全文搜索**：通过 Host 的会话索引搜索，带防抖和取消。
- **面向阅读的预览**：正文片段按可读格式渲染，而不是原始 JSON。工具调用会展开为带字段名的参数卡片，命令会显示为自动换行的代码块，被截断的片段会明确标注。
- **按命中原因组织的预览**：标题/路径命中时标题高亮置顶；顺带的正文命中保持为次要信息，不会抢占整个预览面板。
- **键盘优先**：方向键、`PageUp` / `PageDown`、`Enter`、`Ctrl+U`、`Esc` 均可操作。`Tab` 被限制在查找器内，焦点不会跑到弹窗后面。
- **桌面端 `⌘K` 接管**：首次加载时，通过快捷键服务自身的偏好编辑，把内置的 `session.search` 快捷键转给 **Telescope search**。该改动在 **设置 → 快捷键** 中可见、可改、可恢复。
- **英文和中文界面**，跟随 App 语言。

## 环境要求

- 一个提供以下能力的 DeepSeek Harness 版本：客户端插件槽位
  `shell.overlay` / `sidebar.footer.action`、共享快捷键服务，以及查找器使用的
  `sessions` / `uiWorkspace` 服务。
- 若要使用正文搜索，profile 中需要包含 Host 的 `session-query-sqlite` 行。
  本 bundle 的 `cordis.patch.yml` 会以 `openAt: first-search` 打开该索引；
  标准 Web app bundle 已包含这一行。
- Node.js 仅用于安装 profile 依赖；插件本身是纯 ES module，没有构建步骤。

已在 DeepSeek Harness `0.2.2-rc.1` 上验证。更新的客户端 API 可能需要小幅适配。

## 安装

本仓库是**本地 profile bundle**，不是 npm 包。克隆后在 DSH profile 中链接它。

```bash
git clone https://github.com/MrCroxx/deepseek-harness-telescope.git
```

然后在 profile 目录中操作（桌面 App 为 `~/.dsh/profiles/desktop`，
Web profile 为 `~/.dsh/profiles/web`）：

1. 以链接依赖的方式加入包：

   ```bash
   pnpm add link:/path/to/deepseek-harness-telescope
   ```

   此时 profile 的 `package.json` 中应包含：

   ```json
   "dependencies": {
     "@local/telescope-search": "link:/path/to/deepseek-harness-telescope"
   }
   ```

2. 把 bundle 加入 profile 的有序 bundle 列表：

   ```json
   "dsh": {
     "profile": {
       "bundles": [
         "@deepseek-ai/dsh-base",
         "@deepseek-ai/dsh-web-app",
         "@local/telescope-search"
       ]
     }
   }
   ```

3. 如果是手动编辑 `package.json` 而不是用 `pnpm add`，需要在 profile 目录执行
   `pnpm install`。

4. 重启 DSH。桌面 App 退出后重新打开；Web profile 重启 `dsh web` 服务。

包名刻意使用 `@local/` 作用域并标记为 private：它是 profile bundle，不是 npm 包。

## 使用

通过侧栏底部的 **Search** 行打开查找器，或使用快捷键：

| 环境 | 默认快捷键 |
| --- | --- |
| 桌面 App | 一次性接管后为 `⌘K`；命令自身的默认值为 `⌘⇧F` / `Ctrl+Shift+F` |
| Web（macOS / Windows） | `⌘⌥F` / `Ctrl+Alt+F` |
| Web（Linux） | 默认不绑定；在 **设置 → 快捷键** 中指定 |

查找器内：

| 按键 | 行为 |
| --- | --- |
| `↑` / `↓`、`Ctrl+N` / `Ctrl+P` | 移动高亮 |
| `PageUp` / `PageDown` | 翻八行 |
| `Enter` | 打开当前会话 |
| `Tab` / `Shift+Tab` | 停留在输入框（焦点不会跑到弹窗后面） |
| `Ctrl+U` | 清空输入 |
| `Esc` | 关闭 |

`Tab` 是刻意捕获的。telescope.nvim 把 `<Tab>` 绑定到多选
（`toggle_selection` + `move_selection_worse`，`<S-Tab>` 反向移动），
但本查找器没有多选。如果让浏览器用 `Tab` 做默认焦点切换，焦点会跑到遮罩后面的页面控件上，
输入和方向键会静默失效。因此 `Tab` / `Shift+Tab` 会把焦点交还输入框，
`Esc` 是文档中约定的键盘退出方式。

### 如何阅读结果

一条结果可能命中本地字段（标题/工作区/路径）、正文，或两者都命中。预览会跟随命中原因：

- **标题/路径命中**：标题高亮并置顶。如果正文也命中，会标注 **“正文也有命中”**。
- **正文是 prose**：显示为可读的摘录。
- **标题/路径命中 + 正文是 tool/structured**：只显示一行提示
  （`工具调用 · edit · 路径` 或 `结构化参数`）。JSON 参数不会占满预览；
  按 `Enter` 打开会话查看完整内容。
- **纯正文命中**：摘录就是预览的主内容。列表行会显示 `正文` 或 `工具` 徽标。

预览刻意采用“来源标注卡片”而不是聊天气泡：`session.search` 每次只返回一条
240 个码点的匿名片段，没有 message role；做成气泡会伪造发送方和完整消息。

## 匹配与排序

| 来源 | 是否索引 | 说明 |
| --- | --- | --- |
| 会话标题 | 客户端 fuzzy | 权重 `1.25`；本地命中优先于纯正文命中 |
| 工作区名称 | 客户端 fuzzy | 权重 `0.8` |
| 路径 basename / cwd | 客户端 fuzzy | 权重 `0.75` / `0.55` |
| 用户消息正文 | Host FTS（`user/message`） | 正文命中；每个会话一条摘录 |
| 模型输出正文 | Host FTS（`assistant/message`） | 正文命中；与用户正文同一索引 |
| thinking / reasoning 块 | **否** | Host 的文本提取器对 `reasoning` 块返回 `[]` |
| 工具调用与结果 | Host FTS（`tool/call`、`tool/result`） | 正文命中；渲染为工具卡片 |
| Todo 与 turn 错误 | Host FTS | 正文命中 |

本地标题/工作区/路径这一层在客户端显式加权。正文搜索使用 Host 自己的排序
（`match_count`、较短的文档优先、然后按时间）。`session.search` 只返回
`{ sessionId, snippet }`，不带事件类型，所以客户端无法把用户正文、模型正文和工具输出
分开加权。thinking 本来就不在 Host 索引里，不需要额外权重。真正的按来源加权需要
Host 侧搜索 API 改造。

该 RPC 还会把每条摘录硬截到 **240 个码点**，与索引的 `snippetChars` 配置无关。
因此预览会格式化这段有界窗口，并提示按 `Enter` 打开会话看完整上下文。
索引是内存态（`path: ':memory:'`），在首次搜索时打开，不会拖慢 Host 启动。

## 桌面端 `⌘K` 接管

侧栏搜索框及其快捷键属于内置的 `@deepseek-ai/dsh-client-ui-workspace` 插件。
它的 `session.search` 命令注册在同一个快捷键服务里，而该服务没有“替换已有命令”的 API。

因此在桌面 App 中，本插件会在首次加载时做一次可逆的一次性接管：
通过快捷键服务自身的偏好编辑，把当前的 `session.search` 快捷键复制给 **Telescope search**，
并清掉旧绑定。旧的内联搜索框仍然可以点击，但快捷键现在会打开 Telescope。
该改动会作为普通的快捷键覆盖保存：

- 在 **设置 → 快捷键** 中查看或修改；
- **恢复默认** 会把 `⌘K` 还给 *Search sessions*，并把 Telescope 恢复到自己的默认快捷键；
- `localStorage` 中的标记 `dsh.telescope.takeover.v1` 会阻止插件在恢复默认后再次偷偷接管。

Web profile 保持内置快捷键不变；接管仅限桌面端。

## 限制

- Host 每个会话只返回一条 240 码点摘录，且不带事件/来源信息。客户端拿不到
  “用户 vs 模型 vs 工具”的正文权重。
- 工具调用和工具结果也在 Host 索引中。纯工具命中会显示为结构化卡片；
  标题命中的附属工具命中会缩减为一行提示。
- 没有多选。`Tab` 在输入框内刻意不做事。
- 桌面端接管是快捷键偏好覆盖，不是替换插件；内置搜索框本身仍属于 `ui-workspace`。

## 开发

插件没有构建步骤。文件说明：

- `index.js` — 无副作用的 Host 半边；存在目的是让 Client module scanner 发现包的
  `dsh.client` 声明。
- `client.js` — 浏览器半边：弹窗、侧栏触发器、快捷键命令、模糊匹配、Host 搜索接入、
  预览渲染和样式。
- `cordis.patch.yml` — bundle patch：打开正文搜索所需的 session-query 索引，并插入
  bundle 行。
- `locale/en.json`、`locale/zh.json` — DSH 展示的插件元数据。
- `icon.svg` — 原创图标。

快速检查：

```bash
node --check client.js
node --check index.js
```

开发时按上面的方式把仓库链接进 profile。Host 的客户端 bundle 轮询会在
`client.js` 变化时热重载；必要时重启 profile。

## 许可证

[MIT](LICENSE)
