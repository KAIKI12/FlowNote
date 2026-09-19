# FlowNote 产品需求文档 PRD v0.3

**状态：V1 Baseline**  
**产品阶段：Technical Validation → V1**  
**核心编辑器：Milkdown**

---

# 1. 产品定义

FlowNote 是一款 **Document-first 的 Markdown 笔记软件**。

Markdown 是主要写作方式，同时允许用户将 AI 或其他来源生成的 HTML 作为独立、可长期保存、可交互展示的内容嵌入笔记。

核心定位：

> **Markdown 写作 + HTML 收藏 + 可视化展示**

FlowNote V1 不试图成为：

- Notion 替代品
- 无限画布软件
- PowerPoint 编辑器
- 完整网页 IDE
- AI Agent 平台

V1 只重点验证：

> 用户能否继续像使用普通 Markdown 软件一样写笔记，同时将 AI 给出的 HTML 作为独立、可靠、安全且可迁移的内容嵌入其中。

---

# 2. 产品核心原则

## 2.1 Document-first

FlowNote 首先是一款文档软件。

基本结构：

```text
Markdown Document
│
├─ Markdown 正文
├─ Markdown 图片
├─ Code
└─ HTML Block
```

Markdown 保持连续写作体验。

HTML Block 是文档中的增强嵌入物。

FlowNote 不将：

- 每个段落
- 每个标题
- 每个列表项

全部转化为 Notion 式 Block。

---

## 2.2 最终需求与阶段实现分离

FlowNote 采用分阶段实现，但产品需求不得随着 Slice 缩水。

约束：

```text
PRD / Requirements Matrix = 最终需求
Note Format              = 最终持久化契约
Architecture             = 最终系统边界
Slice Plan               = 当前实现覆盖率
```

Slice 可以把某项能力标为 `Planned / Partial / Implemented`，但不能仅因为当前版本暂未实现就删除最终需求。

最终需求与当前状态统一记录在：

```text
REQUIREMENTS-MATRIX.md
```

资源运行时的完整边界统一记录在：

```text
docs/superpowers/specs/2026-09-15-resource-architecture-design.md
```

---

# 3. Markdown 是主格式

纯 Markdown 笔记保存为：

```text
xxx.md
```

如果用户只使用普通 Markdown 功能：

> 不需要 `.note`，也不需要 FlowNote 专属数据库。

Markdown 应尽量可以继续通过：

- VS Code
- Typora
- Obsidian
- Git
- 其他文本工具

读取和修改。

---

# 4. HTML 是一级内容

HTML 不只是 Markdown 的 Preview 结果。

一个 HTML Block 可以：

- 独立保存
- 独立编辑
- 在 Markdown 文档中嵌入
- 使用 CSS
- 使用受限 JavaScript
- 显示 SVG / Canvas / Chart
- 全屏展示
- 被 VS Code 等工具修改
- 被未来 AI 功能重新设计

HTML 的典型来源包括：

```text
ChatGPT
Claude
Gemini
其他 AI
网页代码
用户自己制作的 HTML
```

用户不需要理解 HTML 技术细节才能使用。

---

# 5. 开放格式原则

FlowNote 的开放性承诺是：

> **用户能够读取、迁移、备份和外部编辑自己的内容。**

开放格式不意味着：

> 所有 FlowNote 视觉效果必须在第三方 Markdown 软件中完全还原。

第三方打开 `.note/content.md` 时最低保证：

- Markdown 正文仍然可读
- 图片路径可以理解
- HTML Block 所在位置可以识别
- 对应 HTML 文件可以独立找到并打开

不要求第三方软件还原：

- iframe 展示
- FlowNote Theme
- FlowNote UI
- 未来 Columns
- Slide
- Speaker Notes
- HTML Block 工具栏

---

# 6. Note 类型

## 6.1 Markdown Note

```text
Timing.md
```

主要用于普通笔记。

支持：

- Markdown
- 本地图片
- 标准 Markdown 编辑

---

## 6.2 Mixed Note

当用户主动使用 HTML Block 等 FlowNote 增强功能时，可将 `.md` 转换为：

```text
Timing.note/
```

`.note` 在磁盘上实际是目录。

FlowNote 文件树中将其显示成一篇普通 Note。

Mixed Note 包含：

```text
Markdown
+
HTML Block
+
Assets
+
Metadata
```

---

# 7. `.md → .note`

第一次在普通 `.md` 中插入 HTML Block 时：

FlowNote 不静默转换。

提示：

> 当前功能需要将此 Markdown 转换为 FlowNote Mixed Note。

用户确认后才执行。

转换原则：

```text
Copy
→ Rewrite References
→ Verify
→ Switch
```

而不是直接破坏原文件。

原 `.md` 和旧资源的最终清理由用户确认或可恢复流程处理。

---

# 8. `.note → .md`

FlowNote 不自动降级。

即使用户删除全部 HTML Block：

```text
Timing.note/
```

仍保持 `.note`。

用户可以主动：

```text
导出 / 转换为 Markdown
```

如果存在 HTML Block，需要明确选择：

- HTML 输出为源码
- HTML 复制为外部文件并插入链接
- 忽略 HTML，只导出 Markdown
- 取消

不得静默丢弃 HTML。

---

# 9. Markdown 编辑体验

V1 默认采用 Milkdown 所见即所得编辑。

目标体验：

> 接近 Typora / Live Preview 式 Markdown 写作。

用户不应该因为 FlowNote 支持 HTML，就失去普通 Markdown 编辑器应有的流畅感。

未来设置可支持：

```text
Markdown Editing

● WYSIWYG
○ Source
○ Source + Preview
```

V1 可以首先完成 WYSIWYG。

---

# 10. Markdown 保真边界

FlowNote 对明确支持的 Markdown：

> 保证语义级 round-trip。

不承诺逐字节保持源文件。

例如：

```markdown
* item
```

有可能保存为：

```markdown
- item
```

但语义必须保持一致。

对于当前编辑器无法安全支持的语法：

> 优先保留原文。

如果无法确认安全往返，应：

- 使用 Raw / Unsupported Node
- 提供 Source Mode
- 或进入只读保护

不得无提示删除用户内容。

需要重点验证：

- YAML Frontmatter
- Footnote
- Raw HTML
- 未知 fenced block
- Obsidian WikiLink
- Mermaid
- LaTeX
- Mixed CJK
- 自定义 Markdown directive

---

# 11. Markdown Raw HTML ≠ FlowNote HTML Block

普通 `.md` 中出现：

```html
<span style="color:red">Important</span>
```

不意味着：

```text
.md → .note
```

更不意味着其中脚本自动获得执行权限。

只有用户明确：

```text
/html
```

或者：

```text
Paste as HTML Block
```

才进入 FlowNote HTML Block 系统。

---

# 12. HTML 导入

HTML 导入必须体现明确用户意图。

## 普通 Ctrl+V

优先理解为：

> 用户正在写 Markdown。

例如浏览器复制文本时即使剪贴板同时包含 `text/html`：

FlowNote 仍优先生成普通 Markdown 内容。

---

## 显式 HTML 导入

用户通过：

```text
/html
```

或：

```text
插入 → HTML
```

进入 HTML 导入流程。

如果剪贴板本身明显是完整 HTML 源码，例如包含：

```html
<!DOCTYPE html>
<html>
```

可以额外提示：

> 检测到完整 HTML 源码，是否作为 HTML Block 导入？

导入确认之前：

> 不执行候选 HTML 中的脚本。

---

# 13. Fragment 与完整 HTML

用户不需要区分两者。

## Fragment

例如：

```html
<div class="card">...</div>
```

FlowNote 自动增加最小 HTML Shell。

---

## Full Document

例如：

```html
<!DOCTYPE html>
<html>
...
</html>
```

按完整网页处理。

在 UI 中两者统一称为：

> HTML Block

区别只属于内部实现和 metadata。

---

# 14. HTML Block UI

普通状态：

```text
┌─────────────────────────────────────┐
│ HTML          编辑   全屏    ···   │
├─────────────────────────────────────┤
│                                     │
│             iframe                  │
│                                     │
└─────────────────────────────────────┘
```

HTML Block 工具栏由 FlowNote 控制。

iframe 内部区域由 HTML 自己控制。

因此：

> V1 不依赖“双击 iframe 任意位置进入编辑”。

---

# 15. HTML 编辑

点击 HTML Block 的：

```text
编辑
```

进入：

```text
Source | Preview
```

模式。

V1 重点验证：

- 能修改源码
- 修改能重新渲染
- 修改能保存
- 关闭重开仍然正确

源码编辑器 V1 不需要达到完整 IDE 水平。

---

# 16. HTML Sandbox

HTML 默认在独立 sandbox 中运行。

允许：

- CSS
- Flex / Grid
- SVG
- Canvas
- 动画
- 页面内 JavaScript
- 图表交互
- Tab / Button 等本页面逻辑

默认禁止：

- 访问 FlowNote DOM
- 调用 FlowNote 内部 API
- 访问其他 Note
- 任意读取本地文件
- 获取 Tauri 权限
- 修改主应用

---

# 17. Script 与 Network 权限

两者必须分离。

## Script

```text
○ Off
● Sandbox
```

默认：

```text
Sandbox
```

---

## Network

```text
● Off
○ Allow this preview session
```

默认：

```text
Off
```

“本次允许联网”的定义：

> 只对当前 Block 当前预览会话有效。

以下行为发生后授权失效：

- Note 关闭
- FlowNote 重启
- HTML Source 发生修改
- 当前 Preview Session 被重新创建

联网授权不写入 `.note`，不随文件传播。

---

# 18. CDN 与远程资源

FlowNote V1 可以扫描：

- Remote JavaScript
- Remote CSS
- Remote Image
- Remote Font

并提示：

```text
检测到外部资源

此 HTML 在离线状态下可能显示不完整。
```

V1 不承诺自动 CDN 本地化。

但 CDN Localization 是保留的后续正式需求，不因 V1 未实现而取消。最终模型采用：

```text
Remote Source URL
↓
block.json localized mapping
↓
assets/shared/<resource-id>/
↓
Resource Resolver
```

默认不要求直接改写 `index.html` 中的 Remote Source URL。Runtime 优先使用合法的 localized mapping；没有本地化副本时才根据当前 preview-session 的 Network Permission 决定联网或阻止。

默认离线必须由 runtime 真正阻止外部网络访问，而不是仅依赖源码扫描。

自动依赖下载、本地化管理和离线重用进入后续版本，但必须沿用这一资源模型。

---

# 19. HTML Viewport

V1 不承诺任意 HTML 都能完美自动撑高。

默认策略：

- 宽度自动响应容器
- 提供合理默认高度
- 高度可通过 FlowNote 工具拖动
- 内容超出时 iframe 内部滚动
- 可以一键全屏

自动高度可在后续通过受控 `postMessage` 协议实现。

---

# 20. HTML Original / Current

HTML Block 只有两个持久内容状态：

```text
Original
Current
```

## Original

定义：

> 用户第一次确认导入该 HTML Block 时保存的 HTML 源文本。

Original 不是完整网页快照。

不保证恢复：

- 后续修改过的图片
- 后续修改过的 CSS 文件
- 后续修改过的 JS 文件
- CDN 内容
- 远程接口状态

---

## Current

当前实际编辑和显示的 HTML。

用户普通编辑和未来 AI 编辑：

> 默认只修改 Current。

---

# 21. 恢复 Original

V1 的功能应明确命名：

> **恢复原始 HTML**

而不是：

> 恢复原始页面

因为 V1 恢复的只是 HTML 源码。

---

# 22. HTML Runtime State

FlowNote V1 不持久化 HTML 的临时运行状态。

例如：

- 当前 Tab
- 表单输入
- Chart Zoom
- 展开状态
- 动画进度
- Canvas 临时状态
- DOM runtime mutation

关闭重新打开以后：

> HTML 从保存的 Current Source 重新初始化。

FlowNote 保存：

```text
Source
Assets
Block Configuration
```

不是浏览器 Session。

---

# 23. HTML Block 复制

普通：

```text
Copy → Paste
```

采用：

> Deep Copy / Value Semantics

复制会产生：

- 新 Block ID
- 新 Block Directory
- Current 副本
- Original 副本
- Block-local Assets 副本

复制后的两个 Block 相互独立。

复制不会重置 Original 的历史含义。

未来 Linked Block 如果存在，必须作为单独显式功能。

---

# 24. HTML Block 本地资源所有权

FlowNote 采用分层资源所有权。

## Block-private resources

FlowNote 管理的 HTML 私有资源必须位于：

```text
blocks/<id>/assets/
```

适用于：

- Block 自己的 CSS / JS
- 图片 / SVG
- JSON / data file
- Font
- WASM / Worker / Module 等 Block 私有文件

FlowNote 不主动生成 HTML Block 间交叉私有依赖。

例如不得主动产生：

```text
../another-block/assets/
```

也不主动使用 Note Markdown 图片目录作为 HTML 私有资源目录。

## Note-shared localized resources

多个 HTML Block 共用的第三方/CDN 本地化依赖可以由 Note 管理：

```text
assets/shared/<resource-id>/
```

这类资源必须：

- 通过 `block.json` 显式声明依赖映射
- 由 Resource Resolver 读取
- 对普通 Block 编辑保持 immutable managed semantics
- 不形成跨 Note 隐式路径依赖

因此 FlowNote 不需要为每个 Block 重复保存同一份 ECharts / Font / Framework 依赖，同时仍保持普通 HTML Block 的 Value Semantics。

Deep Copy 的保证是：

> Block 管理范围内的可变本地文件独立；Note-shared immutable managed resource 可以在同一 Note 内安全共享。

跨 Note Copy 必须把需要的 shared dependency 一起复制/去重到目标 Note。

不保证未本地化的：

- 外部 API
- Remote Image
- Remote Script
- 第三方服务器内容

具有独立副本。

持久化 Source、Resource Resolver 与 Runtime URL 的完整规则见 Resource Architecture 与 Note Format。

---

# 25. 外部编辑

用户使用：

- VS Code
- Typora
- Obsidian
- 其他工具

修改 FlowNote 文件属于合法场景。

---

## 无 Dirty State

检测到外部更新：

> 自动 Reload。

可显示轻量提示：

```text
已从磁盘更新
```

---

## 有 Dirty State

不得静默覆盖。

进入 Conflict State。

V1 可以提供：

- 使用磁盘版本
- 保留 FlowNote 版本
- 另存当前版本

真正 Diff UI 可以后做。

---

# 26. IME 安全

外部更新不得打断中文、日文等 IME composition。

如果外部更新到达时正在输入：

> 延迟应用更新。

composition 结束后：

> 重新判断版本与冲突状态。

---

# 27. 搜索

V1 搜索：

- Note Title
- `content.md`
- Tag（如 V1 已启用）

V1 不保证：

- iframe 可见文本
- CSS
- JavaScript
- Original HTML
- HTML Runtime DOM

HTML 内全文搜索后续独立实现。

---

# 28. Read Mode

V1 正式提供：

```text
Edit
Read
```

Read Mode：

- 隐藏编辑器装饰
- Markdown 适合阅读
- HTML 可正常交互
- 页面保持文档式连续阅读

---

# 29. V1 演示能力

V1 不制作 Note Slide Editor。

V1 仅提供：

```text
Note Fullscreen
HTML Block Fullscreen
```

如果某个 HTML 本身已经是 AI 制作的 PPT / Presentation：

> FlowNote 原样全屏展示，由该 HTML 自己负责分页。

---

# 30. HTML Export

V1 不承诺：

> 单文件、完全离线、所有交互都兼容的 Standalone HTML。

V1 定义：

> **HTML 浏览包 Export HTML Bundle**

例如：

```text
Timing-export/
├─ index.html
├─ blocks/
└─ assets/
```

保证：

- 无需安装 FlowNote 即可浏览
- Markdown 正文存在
- 图片存在
- HTML Block 顺序存在
- HTML 保持适当隔离

不保证：

- CDN 自动下载
- 所有远程依赖离线化
- 所有服务器型脚本在 `file://` 下运行
- 单 HTML 文件

---

# 31. Markdown Export

Mixed Note 可以导出 Markdown。

如果选择“HTML 外部文件链接”：

> FlowNote 必须同时复制对应 HTML 与其 Block Assets。

不得留下指向原 `.note` 内部位置的失效链接。

---

# 32. 删除

FlowNote V1 默认：

```text
Delete
↓
Trash
```

而不是直接永久删除。

V1 不支持 Note 间共享 managed assets。

因此：

> `.note` 内部资源默认属于当前 Note。

---

# 33. V1 必须实现

## Markdown

- `.md`
- Milkdown WYSIWYG
- 基础 Markdown
- Markdown 图片粘贴
- 本地资源保存
- 不支持语法保护基础机制

## Mixed Note

- `.note`
- `note.json`
- `content.md`
- HTML Anchor
- Stable Block ID
- `block.json`

## HTML

- 显式 HTML 导入
- Fragment / Document 自动判断
- Sandbox
- Script Policy
- Network Session Policy
- HTML Editor
- Original / Current
- Block-local Assets
- Fullscreen

## Reliability

- Save
- Reopen
- File Move
- Relative Assets
- External Update
- IME Protection
- Duplicate / Missing Anchor Detection
- Failed Save retains Dirty State

## UI

- File Tree
- Editor
- Inspector / Outline
- Edit
- Read
- Fullscreen

## Export

- Markdown
- HTML Browser Bundle

---

# 34. V1 非目标

V1 不做：

- Native Columns
- Note Slide Editing
- Speaker Notes
- Presenter View
- HTML Theme Normalization
- Arbitrary CSS Rewrite
- CDN Auto Localization
- AI Modification
- AI Generate Note
- AI Generate Slides
- Graph View
- Collaboration
- Cloud Sync
- Plugin Marketplace
- Unsafe JavaScript Mode
- Infinite HTML Canvas
- HTML Runtime State Persistence

---

# 35. V1.5 候选

- Mermaid
- LaTeX
- Advanced Code Highlight
- HTML Auto-height
- HTML Visible-text Search
- CDN Localization
- Theme Tokens
- Limited Theme Adaptation
- Columns
- Note Presentation
- Speaker Notes

---

# 36. V2 候选

AI 功能：

```text
重新设计 HTML
修复 HTML
修改布局
更新 HTML 内容
Visual Restyle
Markdown → HTML Visual
Note → Presentation
```

AI 修改流程：

```text
Current
↓
AI Candidate
↓
Visual Before / After
↓
User Accept
↓
Current
```

AI 不得静默覆盖用户 Current。

---

# 37. V1 性能定位

V1 的主要目标文档：

> Markdown 为主 + 少量复杂 HTML Visual。

建议技术验收场景：

```text
1–6 个复杂 HTML Block
```

能够保持流畅：

- 滚动
- 编辑
- 保存
- 重开

V1 不以几十个持续运行 iframe 为性能目标。

---

# 38. V1 成功标准

建立：

```text
Timing.note
```

内容：

```text
Markdown A
Image A
HTML A
Markdown B
HTML B
Markdown C
```

验证：

1. 正常保存
2. 正常关闭
3. 正常重开
4. Markdown 内容一致
5. HTML 顺序一致
6. 图片显示正常
7. HTML CSS 正常
8. HTML Sandbox JS 正常
9. 移动整个 `.note`
10. 重新打开路径仍正确
11. VS Code 修改 HTML 后 FlowNote 能识别
12. 外部修改不打断 IME
13. 复制 HTML A 后修改副本不影响 A
14. HTML 缺失时不删除 Anchor
15. 保存失败时仍保留 Dirty State

全部成立：

> FlowNote V1 核心技术假设验证通过。

---

# 39. 产品核心总结

> Markdown 保存知识。

> HTML 保存复杂视觉表达。

> FlowNote 负责让两者可靠、安全且开放地共存。

> 用户的数据属于用户。

> V1 优先保证数据模型和长期可靠性，而不是功能数量。