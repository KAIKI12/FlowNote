# FlowNote Note Format v1.2

**Status：Final**
**formatVersion：1**
**Freeze verified：2026-09-19**
**Revision note：v1.2 finalizes the layered resource model and Format v1 invariants without changing disk `formatVersion`. Future incompatible disk semantics require a new `formatVersion`.**

---

# 1. 格式目标

FlowNote Note Format 用于定义 Mixed Note 的持久化结构。

设计目标：

1. Markdown 保持可读
2. 内容顺序只有一个事实来源
3. HTML 独立保存
4. 资源可迁移
5. 允许外部编辑
6. 避免隐藏数据库绑定
7. 支持 Git
8. 保存失败可恢复
9. 编辑器实现可替换
10. 支持未来 Migration

---

# 2. 文件类型

普通 Markdown：

```text
note.md
```

Mixed Note：

```text
note.note/
```

`.note` 是普通目录。

---

# 3. Format v1 目录

```text
Timing.note/
│
├─ note.json
├─ content.md
│
├─ blocks/
│  ├─ <block-id-A>/
│  │  ├─ block.json
│  │  ├─ index.html
│  │  ├─ original.html
│  │  └─ assets/
│  │     ├─ style.css
│  │     ├─ script.js
│  │     └─ image.png
│  │
│  └─ <block-id-B>/
│     ├─ block.json
│     ├─ index.html
│     └─ original.html
│
└─ assets/
   ├─ images/
   ├─ attachments/
   └─ shared/
      └─ <resource-id>/
         ├─ meta.json
         └─ payload/
            └─ ...
```

---

# 4. Source of Truth

## `content.md`

唯一负责：

> 正文及线性阅读顺序。

包括：

- Markdown
- Markdown Image
- HTML Anchor Position

Block 顺序不得在 JSON 中再次保存。

---

## `note.json`

仅负责：

> Note-level metadata。

---

## `block.json`

仅负责：

> 单个 Block 自己的配置。

不得记录：

- 当前 Block 在文档中的顺序
- 前后 Block
- Markdown 正文

---

## `index.html`

当前 HTML。

---

## `original.html`

首次确认导入时的 HTML 源文本备份。

---

# 5. `note.json`

最小格式：

```json
{
  "formatVersion": 1,
  "title": "Timing Closure",
  "type": "mixed",
  "createdAt": "2026-09-10T10:00:00+08:00",
  "updatedAt": "2026-09-10T10:30:00+08:00"
}
```

V1 不保存：

- Block 顺序
- Markdown Body
- HTML Body
- Asset List

---

# 6. HTML Anchor

Format v1 使用标准 fenced code block：

````markdown
```flownote-html
{"id":"0199a111-0000-7000-8000-000000000001"}
```
````

示例：

````markdown
# Timing Closure

Markdown A.

```flownote-html
{"id":"0199a111-0000-7000-8000-000000000001"}
```

Markdown B.
````

这是：

> Format v1 的存储语法。

不承诺未来 UI 永远使用这种视觉表达。

---

# 7. Anchor 限制

Anchor 只允许保存：

```json
{
  "id": "..."
}
```

不得写入：

- `src`
- Absolute Path
- Tauri URL
- Blob URL
- Machine Path
- Runtime Permission

Block Path 统一推导：

```text
blocks/<id>/
```

---

# 8. Block ID

建议生成：

> UUID v7。

要求：

- Note 内唯一
- 创建后稳定
- 移动不改变
- HTML 修改不改变
- Note Rename 不改变
- 不由 Content Hash 决定
- UI 默认不显示

ID 必须通过合法格式和路径安全校验。

不得允许：

```text
../
\
/
:
```

等产生 Path Traversal 的值。

---

# 9. Anchor 唯一性

V1 中：

> 同一 Note 的一个 Block ID 最多只能在 `content.md` 中出现一次。

重复 Anchor：

```text
A
...
A
```

属于 Format Error。

FlowNote：

- 不将其解释为 Linked Block
- 不静默修改磁盘
- 显示重复引用错误
- 提供“复制为独立 Block”等修复操作

---

# 10. 无效 Anchor

ID 格式错误：

> 原 fenced block 保留。

FlowNote 显示：

```text
Invalid FlowNote Block Reference
```

不得删除源码。

---

# 11. Missing Block

`content.md` 中 Anchor 存在：

```text
A
```

但：

```text
blocks/A/
```

不存在时：

FlowNote 显示：

```text
HTML Block Missing
```

不得：

- 删除 Anchor
- 创建空 HTML 后静默覆盖
- 修改 content.md

用户可以：

- Locate
- Repair
- Remove Reference

---

# 12. Orphan Block

存在：

```text
blocks/B/
```

但 `content.md` 没有引用。

定义为：

> Orphan Block。

V1：

- 不自动删除
- 可在诊断工具中列出
- 删除需用户确认或进入 Trash

原则：

> 宁可留下 Orphan，不主动制造数据丢失。

---

# 13. Unknown Format Version

如果：

```text
formatVersion > 当前 FlowNote 支持版本
```

FlowNote 必须进入：

> Read-only Safe Mode。

不得按照旧版 Format 自动写回。

可以：

- 尝试读取已知部分
- 显示文件
- 导出原始目录

不得：

- Auto Save
- Rewrite
- Downgrade

---

# 14. `block.json`

HTML Block 示例：

```json
{
  "kind": "html",
  "inputKind": "fragment",
  "scriptPolicy": "sandbox",
  "viewport": {
    "heightPx": 480
  }
}
```

允许未来增加向后兼容字段。

Resource-aware 示例：

```json
{
  "kind": "html",
  "inputKind": "fragment",
  "scriptPolicy": "sandbox",
  "viewport": {
    "heightPx": 480,
    "width": "wide"
  },
  "resources": {
    "localized": [
      {
        "source": "https://cdn.example/echarts.min.js",
        "resourceId": "res_0199_echarts",
        "entry": "payload/echarts.min.js",
        "type": "script"
      }
    ]
  }
}
```

规则：

- Block-private `assets/**` 的所有权由目录结构隐含，不要求逐文件登记。
- `resources.localized` 只登记不能由 Block 私有目录自然表达的共享/本地化依赖映射。
- 未识别的向后兼容字段必须尽量保留。
- 资源 metadata 不得授予 Runtime Trust 或 Network Permission。

---

# 15. `block.json` 默认值

如果文件缺失或字段缺失：

建议默认：

```text
kind = html
inputKind = document
scriptPolicy = sandbox
viewport.heightPx = default
```

但：

> 缺失 metadata 不允许赋予更高权限。

---

# 16. Runtime Trust 不持久化

以下内容不得作为可传播的信任写入 `block.json`：

```text
network allowed
trusted HTML
allow FlowNote API
unsafe mode
```

例如：

```text
Allow Network This Session
```

仅存于 Runtime State。

关闭 Preview 后失效。

---

# 17. Script Policy

可持久配置：

```text
off
sandbox
```

不得在 Format v1 定义：

```text
unsafe
host-access
```

---

# 18. Network Policy

V1 网络授权不是文件格式字段。

由 Runtime Permission Manager 管理。

默认：

```text
network = denied
```

---

# 19. Original

`original.html` 定义为：

> 用户第一次确认导入该 Block 时保存的 HTML 源文本。

Original：

- 不因普通编辑改变
- 不因 `block.json` 改变而改变
- 不因 Theme 改变而改变
- 不因 viewport 改变而改变

---

# 20. Original 不等于 Snapshot

恢复 Original：

> 只恢复 HTML Source。

不保证恢复：

- `assets/` 的历史版本
- 外部 CDN
- Remote Image
- Server Data
- Runtime State

真正 Snapshot 属于未来格式扩展。

---

# 21. Current

```text
index.html
```

是当前实际使用 HTML。

用户编辑：

```text
index.html
```

未来 AI 接受修改：

```text
index.html
```

Original 保持不变。

---

# 22. Fragment

如果 Original Input 为：

```html
<div>...</div>
```

则：

```text
inputKind = fragment
```

FlowNote 可在 Runtime 包装 HTML Shell。

如果保存时选择写入标准 Shell，也必须能够区分：

> 用户初始输入是什么。

---

# 23. HTML Block Resource Ownership

FlowNote 管理的 HTML 私有本地资源位于：

```text
blocks/<id>/assets/
```

例如：

```text
blocks/A/
├─ index.html
└─ assets/
   └─ chart.js
```

HTML：

```html
<script src="./assets/chart.js"></script>
```

Block-private 资源可以包含 CSS / JS / Image / SVG / JSON / Font / WASM / Worker / Module 等文件。具体 Runtime 是否已经支持某种 Web API，不改变其持久化所有权。

---

# 23A. Note-Shared Localized Resources

FlowNote 可以为多个 HTML Block 共用的远程/CDN 依赖保存 Note-owned immutable local copy：

```text
assets/shared/<resource-id>/
├─ meta.json
└─ payload/
   └─ ...
```

最小 `meta.json` 示例：

```json
{
  "kind": "localized",
  "source": "https://cdn.example/echarts.min.js",
  "entry": "payload/echarts.min.js",
  "contentType": "application/javascript",
  "integrity": "sha256-...",
  "immutable": true
}
```

规则：

1. `resource-id` 是 Note-local、稳定、路径安全的 opaque ID；不得直接使用 Host Path 作为 ID。
2. Shared resource 属于 Note，不属于任一单独 Block。
3. Block 通过 `block.json.resources.localized` 显式声明 source → resourceId / entry 映射。
4. `meta.json.source` 记录本地化资源的 provenance；若它与 Block mapping 的 `source` 不一致，FlowNote 必须诊断/拒绝映射，不能静默把一个来源替换成另一个来源。
5. Shared resource 对普通 Block 编辑器视为 immutable managed resource。
6. 需要修改 Shared resource 时，FlowNote 应创建新 resource identity 或 Detach/Copy 为 Block-private asset，不原地改变共享对象。
7. Shared resource 不得形成跨 Note 隐式文件依赖。
8. 未被引用的 Shared resource 可以成为 GC/Trash 候选，但不得在没有恢复策略时静默删除。

---

# 23B. Persistent Source 与 Runtime Resource 分离

持久化 HTML 保持正常相对路径或远程 URL：

```html
<link rel="stylesheet" href="./assets/style.css">
<script src="https://cdn.example/echarts.min.js"></script>
```

Runtime Loader / Resource Resolver 负责将其解析成当前会话可访问的受控资源。

不得因为 Runtime materialization 自动把 `index.html` 改写为：

```text
blob:
tauri:
asset:
http://localhost...
C:\Users\...
```

Runtime URL 是 session artifact，不是 Note Source。

---

# 24. 禁止 FlowNote 主动创建跨 Block 本地依赖

FlowNote 不主动创建：

```text
Block A → Block B/assets
```

也不主动创建：

```text
Block A → Note/assets/images
```

作为 HTML 私有依赖。

允许的 Note-level shared 依赖只有：

```text
Block A → block.json.resources.localized → assets/shared/<resource-id>/...
```

即：HTML Block 不能通过随意的 `../../assets/shared/...` 文件路径绕过 manifest；Note-shared managed dependency 必须经过显式 metadata + Resource Resolver。

外部编辑产生越界引用时：

- 不提升权限
- 不自动复制整个任意路径
- 可提示“不受管理的本地引用”

---

# 25. Deep Copy

复制 HTML Block：

```text
A → B
```

必须：

1. 创建新 ID
2. 复制 `block.json`
3. 复制 `index.html`
4. 复制 `original.html`
5. 复制 Block-local `assets/`
6. 保留或重建合法的 `resources.localized` 映射

复制保证：

> FlowNote 管理范围内的可变 Block-private 文件独立。

同一 Note 内，多个 Block 可以引用同一个 immutable `assets/shared/<resource-id>`；这不违反 Value Semantics，因为共享对象不可由普通 Block 编辑器原地修改。

跨 Note Copy 时：

- Block-private assets 必须复制到目标 Block
- 被引用的 shared localized resources 必须复制/去重到目标 Note 并生成目标 Note 有效映射
- 不得创建跨 Note 隐式文件依赖

不保证远程资源独立。

---

# 26. Markdown Assets

Mixed Note Markdown 图片：

```text
assets/images/<stable-name>.<ext>
```

正文：

```markdown
![](assets/images/img_xxx.png)
```

资源文件名使用稳定标识。

不因为 Note 标题修改而批量 Rename。

---

# 27. 普通 `.md` 图片

推荐：

```text
Timing.md
Timing.assets/
```

例如：

```text
Timing.assets/img_xxx.png
```

正文：

```markdown
![](Timing.assets/img_xxx.png)
```

---

# 28. `.md → .note`

转换采用：

```text
Copy → Validate → Commit
```

流程：

1. 创建临时 Mixed Note
2. Copy Markdown
3. Copy Managed Images
4. Rewrite New Relative Paths
5. Parse Validation
6. Resource Existence Validation
7. Commit Conversion
8. 更新 FlowNote Current Document Pointer

失败：

> 原 `.md` 保持不受损。

旧资源不在未确认情况下立即删除。

---

# 29. `.note` 不自动降级

删除最后一个 HTML Block：

> `.note` 保持不变。

转换回 Markdown：

> 用户显式操作。

---

# 30. Managed Path

FlowNote 管理的资源引用：

> 必须是迁移安全的相对路径，或由 metadata 显式声明的 Note-shared resource mapping。

FlowNote 管理资源分为：

```text
Markdown managed asset     → assets/images | assets/attachments
HTML Block private asset   → blocks/<id>/assets/**
Note shared localized      → block.json mapping → assets/shared/<resource-id>/**
```

Format 规则只针对 FlowNote 管理资源。

用户文章、Code Block 或教程文字中出现：

```text
C:\projects\foo
```

不属于需要重写的路径。

---

# 31. Runtime URL 不落盘

以下内容不得被保存为 managed asset path：

```text
blob:
tauri:
asset:
http://localhost...
C:\Users\...
```

Runtime Loader / Resource Resolver 负责：

```text
Persisted Relative Path / Localized Mapping / Remote URL
↓
Capability + Block Boundary Validation
↓
Ownership Classification
↓
Network / CSP / MIME / Size Policy
↓
Controlled Runtime Resource or Deny
```

Runtime 实现不得依赖把某几个 HTML tag 的 `src/href` 做一次性正则替换作为长期架构边界。早期实现可以使用 data/blob URL 作为 materialization 技术，但持久化层和 resolver 接口必须能扩展到 CSS `url()` / `@import`、relative `fetch()`、module import、Worker、WASM 等资源请求。

---

# 32. HTML Runtime State

Format v1 不保存：

- DOM Mutation
- Form Runtime Value
- Current Tab
- Animation Progress
- Canvas State
- Chart Zoom
- Temporary JS Variables

重新打开：

> 从 Current Source 和 Assets 初始化新页面。

---

# 33. 外部修改

FlowNote 必须允许外部工具修改：

```text
content.md
note.json
block.json
index.html
```

---

# 34. External Update + Clean State

没有本地未保存修改时：

> 可以 Reload。

但如果正在 IME composition：

> 延迟应用。

---

# 35. External Update + Dirty State

出现：

```text
Disk Changed
+
Local Dirty
```

进入 Conflict State。

不得：

- 自动覆盖磁盘
- 自动覆盖编辑器
- 静默 Last Write Wins

---

# 36. IME

Composition 期间：

```text
externalUpdate → Queue
```

Composition End：

```text
Recheck Version
↓
Apply / Conflict
```

---

# 37. Markdown Round-trip

明确支持语法：

> 保证语义 round-trip。

暂不支持语法：

> 优先原文保留。

无法安全保留：

> Read-only / Source fallback。

不得无提示修改或删除未知内容。

---

# 38. Raw Markdown HTML

普通 Markdown Raw HTML：

> 仍属于 Markdown Source。

不会因此：

- 创建 Block
- 获得 Sandbox
- 执行任意 Script
- 转换 Note

只有 `flownote-html` Anchor 指向真正 HTML Block。

---

# 39. Save Consistency

Format 不强制某种数据库事务技术。

但必须达到：

> “Save Success”表示本次保存所需关键文件已经持久化。

失败：

> 必须保持可恢复状态。

---

# 40. Save Ordering

新增 Block 推荐：

```text
Write assets
↓
Write block.json
↓
Write original.html
↓
Write index.html
↓
Validate Block
↓
Commit content.md Anchor
```

核心原则：

> **Block 先存在，Anchor 后提交。**

宁可产生 Orphan：

```text
Block exists
Anchor missing
```

也尽量避免：

```text
Anchor exists
Block missing
```

---

# 41. Delete Ordering

删除 Block 推荐：

```text
Remove Anchor
↓
Persist content.md
↓
Move Block Directory to Recoverable Trash
```

不要先永久删除文件再修改 Anchor。

---

# 42. Save Queue

同一 Note：

> 保存操作必须串行。

避免多个 Auto-save 并发更新：

```text
content.md
block.json
index.html
```

导致顺序错乱。

---

# 43. Save Failure

写入失败：

- Dirty State 保留
- UI 显示保存失败
- 不伪装“已保存”
- 临时文件保留到恢复策略处理
- 关闭应用时必须提示或完成保存

---

# 44. Crash Recovery

重启时应检查：

- Temporary Files
- Missing Block
- Orphan Block
- Partial Conversion
- Pending Trash

不得未经用户确认自动销毁异常文件。

具体 Recovery Journal 实现属于 Technical Design。

---

# 45. Milkdown 不属于格式

Format 不依赖：

```text
Milkdown
ProseMirror
React
Tauri
```

Milkdown Custom Node 必须最终可序列化成：

````markdown
```flownote-html
{"id":"..."}
```
````

未来替换编辑器：

> Format 仍然有效。

---

# 46. HTML Browser Bundle Export

V1 导出允许：

```text
export/
├─ index.html
├─ blocks/
└─ assets/
```

Browser Bundle 不是 Note Format 本体。

---

# 47. Markdown Export

HTML Block 输出为外部链接时：

> 必须复制 Block HTML 和 Block-local Assets 到 Export Directory。

不得生成依赖原 `.note` 的内部路径。

---

# 48. Git Friendly

实现应尽量：

- JSON Stable Key Order
- Relative Paths
- Stable IDs
- 仅修改真正变化的文件
- 不随机格式化整个文件
- 不因打开文件就改变磁盘
- 避免每次 Auto-save 更新无意义 metadata

`updatedAt` 的更新策略由实现进一步定义。

---

# 49. Format Migration

所有 Note：

```json
{
  "formatVersion": 1
}
```

未来：

```text
v1
↓
Migration
↓
v2
```

Migration：

- 必须可测试
- 失败不得破坏原始 Note
- 推荐先备份或临时转换
- 不允许通过猜目录结构判断版本

---

# 50. Format v1 非范围

Format v1 不定义：

- Native Columns
- Slide
- Speaker Notes
- Linked Block
- AI Revision History
- Full Snapshot
- Shared Workspace Assets
- Cloud Sync
- HTML Theme Rewrite

未来扩展不得破坏：

> `content.md` 是内容和线性顺序唯一事实来源。

---

# 51. Format v1 Core Invariants

### I1

`content.md` 是正文及线性顺序唯一 Source of Truth。

### I2

Anchor 只保存稳定 ID。

### I3

HTML Content 独立保存。

### I4

Block ID 在 Note 内唯一。

### I5

一个 Block ID 在正文只能被 Anchor 一次。

### I6

Original 不被普通编辑覆盖。

### I7

FlowNote Managed Resources 不依赖机器绝对路径。

### I8

Runtime Trust 不随文件传播。

### I9

复制 HTML Block 创建独立身份与独立 managed local resources。

### I10

未知 Format Version 不自动写回。

### I11

宁可 Orphan，不主动制造悬空 Anchor。

### I12

Unsupported Markdown 不允许无提示丢失。

### I13

Editor Implementation 不是 Format。

### I14

保存失败必须保持可恢复状态。

---

# 52. Format v1 Freeze Test

建立：

```text
FormatTest.note/
```

至少包含：

```text
Markdown A
Image A
HTML A + local CSS
Markdown B
HTML B + JS
Markdown C
```

必须验证：

### Normal

- Save
- Reopen
- Markdown Order
- HTML Order
- Image
- Local CSS
- Local JS

### Move

- Rename Note Folder
- Move Note Folder
- Reopen

全部资源继续正确。

### Copy

复制 HTML A：

- New ID
- New Directory
- 修改 B 不影响 A

### External Edit

VS Code 修改：

```text
content.md
index.html
```

FlowNote 正确识别。

### IME

中文 composition 时外部修改：

> 不打断正在输入的文字。

### Invalid Anchor

测试：

- Duplicate ID
- Invalid ID
- Missing Block
- Orphan Block

不得造成自动数据丢失。

### Unsupported Markdown

放入：

- Frontmatter
- Unknown Fence
- Raw HTML
- Mermaid
- WikiLink

打开保存后：

> 未支持内容不得静默消失。

### Crash / Failure

模拟：

- Block 创建一半
- content.md Save Failure
- Temporary File Remains

重新打开：

> 能识别异常且不自动销毁数据。

### Unknown Version

```json
{
  "formatVersion": 999
}
```

必须：

> Read-only，不写回。

### Freeze Verification — 2026-09-19

Format v1 已通过冻结 Gate：

- Normal / Save / Reopen / Markdown & HTML order：PASS
- Move / Rename / Reopen：PASS
- same-note Deep Copy identity / private asset isolation：PASS
- External Edit：Clean reload、Dirty conflict、Local Save As 均 PASS
- IME：composition 期间外部修改延迟处理，PASS
- Invalid / Duplicate / Missing / Orphan Anchor：保留源码与资源，不自动删除，PASS
- Unsupported Markdown：Frontmatter、Unknown Fence、Raw HTML、Mermaid、WikiLink 等保真路径，PASS
- Crash / Failure：partial Block、遗留 recovery temp、atomic save conflict recovery package 均可恢复且不自动销毁，PASS
- Unknown `formatVersion`：只读打开，禁止 save / save-as / rewrite / downgrade，PASS
- 外部 snapshot hydration 的 Markdown 规范化回声不会被误判为本地编辑，回归测试 PASS

可重复入口：

```text
npm run test:format-freeze
```

> **结论：Note Format v1 已从 Freeze Candidate 升级为 Final。磁盘字段保持 `formatVersion: 1`。**