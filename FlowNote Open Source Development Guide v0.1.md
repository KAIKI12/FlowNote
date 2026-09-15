# FlowNote Open Source Development Guide v0.1

**目的：加速开发，避免重复造轮子。**

原则：

> FlowNote 自己设计产品和 Note Format，但成熟通用能力优先借鉴现有开源实现。

---

# 1. 当前核心技术栈

目前 FlowNote：

```text
Desktop
Tauri 2

Frontend
React + TypeScript + Vite

Markdown
Milkdown / ProseMirror
```

当前阶段不因为“有更新版本”就主动重构技术栈。

优先目标：

> 完成 Markdown + HTML Block Vertical Slice。

技术升级不得阻塞核心验证。

---

# 2. 第一优先级：Milkdown 官方

## Milkdown / Milkdown Examples

定位：

> FlowNote Markdown 编辑器能力的第一参考源。

Milkdown 本身是基于 ProseMirror 与 remark 的插件化 WYSIWYG Markdown framework；官方 examples 当前包含 React/Crepe、React custom component、React Slash、React Block、iframe syntax、Image Block、Code Block、Shiki 和 OpenAI 示例。

FlowNote 应重点研究：

```text
React Crepe
React Custom Component
React Block
React Slash
Vanilla Iframe Syntax
Image Block
Code Block
Shiki Highlight
```

---

## 直接对应 FlowNote

```text
Milkdown React Custom Component
        ↓
FlowNoteHtmlBlock NodeView

Milkdown React Block
        ↓
Block Toolbar / Hover UI

Milkdown React Slash
        ↓
/html
/image
未来 /columns

Milkdown Iframe Syntax
        ↓
HtmlSandbox Prototype

Milkdown Image Block
        ↓
Paste Image

Shiki
        ↓
Code Highlight
```

---

# 3. Milkdown 使用原则

FlowNote 不允许应用其他区域直接依赖大量 Milkdown 内部 API。

增加：

```text
FlowNoteEditor
```

作为 Adapter。

推荐 API：

```ts
interface FlowNoteEditorApi {
  getMarkdown(): string
  setMarkdown(markdown: string): void
  insertHtmlBlock(id: string): void
  insertImage(path: string): void
  focus(): void
  setReadOnly(value: boolean): void
}
```

目标：

```text
FlowNote App
    ↓
FlowNoteEditor API
    ↓
Milkdown
```

未来如果编辑器发生变化：

> App 和 Note Format 不需要整体重写。

---

# 4. 第二优先级：Markup

## oratis/Markup

Markup 当前采用：

```text
Tauri 2
React + Vite
Milkdown / ProseMirror
CodeMirror 6
Zustand
Mermaid
KaTeX
Tantivy
```

并已经实现 Read/Edit/Source、文件树、图片粘贴、Outline、全文搜索、文件监听、debounced auto-save、atomic write 和 mtime guard；其 README 还明确说明 Markdown 是实际文件，编辑模式使用 Milkdown，源码模式使用 CodeMirror。

### FlowNote 重点借鉴

不是复制产品方向，而是学习工程结构：

```text
File Open
File Save
Auto Save
File Watcher
mtime Guard
External Change
Read Mode
Edit Mode
Source Mode
Image Assets
Lazy Loading
Outline
```

---

# 5. Markup 对应 FlowNote 文件

建议开发时：

```text
src/editor/FlowNoteEditor.tsx
    ← Markup Editor 生命周期

src/note/noteSaver.ts
    ← Markup debounce / atomic save 思路

src/note/fileWatcher.ts
    ← Markup external change

src/components/Outline.tsx
    ← Markup outline

未来 SourceMode
    ← Markup CodeMirror 6
```

---

# 6. 不直接复制 Markup 的部分

Markup 当前本质仍然是：

> Markdown Vault。

FlowNote 的差异点：

```text
.note
HTML Block
block.json
Sandbox
HTML Original / Current
```

因此：

> FlowNote Note Format 必须自己维护。

不能为了复用 Markup，改变 Format Spec 去适应它。

---

# 7. 第三优先级：Hanshi

## 7nohe/hanshi

Hanshi 是基于 Milkdown Crepe 的 VS Code WYSIWYG Markdown 编辑器。

它当前特别关注：

- Source Fidelity
- Bidirectional Sync
- Minimal Changed Range
- Pending Version Tracking
- External Update
- IME Composition
- Local Image Assets

实现说明显示，它会跟踪自发更新、防止 stale edit，尝试用 block-level/top-level Markdown 范围减少不必要重写，并且外部更新在 IME composition 时会延迟应用。

---

# 8. FlowNote 应直接借鉴 Hanshi 的思想

## Version Guard

```text
Editor Change
↓
Save
↓
File Watch Event
```

不能被误判为：

> 外部程序修改。

需要记录 Self-originated Update。

---

## IME Safety

```text
isComposing = true
↓
External Update
↓
Queue
↓
compositionend
↓
Version Recheck
```

尤其 FlowNote 中文用户场景必须测试。

---

## Markdown Diff

V1 可以接受：

> Milkdown 正常序列化。

但长期应参考 Hanshi：

```text
Block Map
Block Diff
Minimal Text Diff
```

减少 Git Noise。Hanshi 自己也明确把 source fidelity 视为重要问题，并说明其当前实现仍可能产生无关格式变化。

---

# 9. Markdown Live Editor

## ishiij-dev/vscode-markdown-live-editor

该项目使用 Milkdown 提供 WYSIWYG 和 bidirectional source sync，并已经覆盖 GFM 等 Markdown 编辑场景。

主要用于参考：

```text
Milkdown Productization
Outline
Source Synchronization
Slash UX
Markdown Features
```

优先级：

> 第二梯队。

如果 Milkdown 官方 Example 太小、Markup 太复杂，可以拿它做中间参考。

---

# 10. iso.md

## aaroi/iso-md

这是一个较小的 Tauri v2 + Milkdown 编辑器，项目结构相对简单，并提供 WYSIWYG、Raw Markdown 和 Tauri 文件能力。

适合回答：

> 一个最小 Tauri + Milkdown 桌面编辑器到底需要多少代码？

推荐参考：

```text
Editor Setup
Tauri File Open
Raw Source Mode
Simple Project Structure
Print / Export
```

不建议作为 FlowNote 完整架构底座。

---

# 11. Typability

## SimonShiki/Typability

该项目使用 React、Tauri、Milkdown，并强调 Fluent Design / Mica / Acrylic 风格，适合作为 Windows 桌面 UI 参考。

主要借：

```text
Windows Desktop Feeling
Fluent UI
Window Chrome
Toolbar
Mica / Acrylic
```

主要不借：

```text
Note Format
FlowNote Architecture
HTML Model
```

---

# 12. HTML Security：DOMPurify

DOMPurify 是专门用于 HTML/SVG/MathML sanitization 的成熟开源库，并提供安全默认配置和扩展 hooks。

FlowNote 后期可以用于：

```text
HTML Fragment
↓
Sanitize
↓
DOM-based Preview
```

但注意：

> DOMPurify 不能替代完整 HTML Page 的 iframe Sandbox。

V1 Full HTML：

```text
iframe sandbox
```

仍然是核心隔离层。

---

# 13. Presentation：Reveal.js

Reveal.js 是成熟的 HTML Presentation framework，本身支持：

- HTML Slide
- Markdown
- Nested Slide
- Speaker Notes
- Auto Animate
- PDF Export
- KaTeX
- Syntax Highlight。

FlowNote V1：

> 暂不集成。

V1.5 / V2 做 Note Presentation 时优先评估：

```text
FlowNote Presentation Model
↓
Adapter
↓
Reveal.js
```

而不是自己重写：

- Slide Router
- Speaker Window
- Keyboard Navigation
- Presentation Timer

---

# 14. Columns / Drag & Drop：dnd-kit

dnd-kit 当前提供 React 等 framework adapter，支持 sortable、grid、multiple containers、keyboard interaction 和 accessibility。

FlowNote V1：

> 不需要。

V1.5 Native Columns：

优先用于：

```text
Block Reorder
Columns Drop Zone
Multiple Containers
Keyboard Drag
```

不要自己从 Pointer Event 开始造完整拖拽框架。

---

# 15. Resizable Layout：react-resizable-panels

react-resizable-panels 提供 Panel Group、Resizable Panels 和 Resize Handle，适合 FlowNote 的：

```text
FileTree
|
Editor
|
Inspector
```

三栏布局。

如果目前自研 Resizer 已经稳定：

> 不要求替换。

如果仍有：

- Pointer Bug
- Min Width
- Collapse
- Persist Width

等问题，可直接评估使用。

---

# 16. 开源项目使用优先级

## Tier 1 — 开发阶段必须研究

```text
Milkdown
Milkdown Examples
Markup
Hanshi
```

这四个直接决定：

- 编辑器
- Custom Node
- Slash
- 文件保存
- Markdown Sync
- IME
- 外部修改

---

## Tier 2 — 对应功能开发时研究

```text
Markdown Live Editor
iso.md
DOMPurify
```

---

## Tier 3 — V1.5 之后

```text
Reveal.js
dnd-kit
Typability
react-resizable-panels
```

---

# 17. FlowNote 不应该外包给开源项目的部分

以下属于 FlowNote 核心 IP / 架构：

```text
.note Format
content.md Anchor Model
block.json
HTML Resource Ownership
Original / Current
Block Identity
Markdown ↔ Mixed Note Conversion
HTML Import UX
Sandbox Permission Model
Export Semantics
AI Change Acceptance Model
```

这些不能通过：

> “哪个仓库有类似代码？”

决定产品设计。

开源库服务 Format。

Format 不服务开源库。

---

# 18. 当前目录建议

```text
src/
├─ app/
│  └─ App.tsx
│
├─ editor/
│  ├─ FlowNoteEditor.tsx
│  ├─ editorTypes.ts
│  │
│  └─ plugins/
│     ├─ htmlBlock/
│     │  ├─ HtmlBlockNode.ts
│     │  ├─ HtmlBlockView.tsx
│     │  ├─ htmlBlockSerializer.ts
│     │  └─ htmlBlockCommands.ts
│     │
│     └─ slash/
│        └─ SlashMenu.tsx
│
├─ note/
│  ├─ noteTypes.ts
│  ├─ noteLoader.ts
│  ├─ noteSaver.ts
│  ├─ noteValidator.ts
│  ├─ noteMigration.ts
│  ├─ assetResolver.ts
│  ├─ fileWatcher.ts
│  └─ noteStore.ts
│
├─ html/
│  ├─ HtmlSandbox.tsx
│  ├─ HtmlEditor.tsx
│  ├─ HtmlBlockToolbar.tsx
│  ├─ htmlImporter.ts
│  └─ htmlResourceScanner.ts
│
├─ components/
│  ├─ FileTree.tsx
│  ├─ Inspector.tsx
│  └─ Outline.tsx
│
└─ styles/
```

---

# 19. 文件 → 开源参考映射

| FlowNote 文件 | 第一参考 | 第二参考 |
|---|---|---|
| `FlowNoteEditor.tsx` | Milkdown Examples | Markup |
| `HtmlBlockNode.ts` | Milkdown Custom Component | Milkdown Block |
| `HtmlBlockView.tsx` | Milkdown React Component | Milkdown iframe example |
| `SlashMenu.tsx` | Milkdown React Slash | Markdown Live Editor |
| `noteSaver.ts` | Markup | Hanshi |
| `fileWatcher.ts` | Markup | Hanshi |
| Markdown Sync | Hanshi | Markup |
| IME Guard | Hanshi | — |
| `Outline.tsx` | Markup | Markdown Live Editor |
| Source Mode | Markup / CodeMirror | iso.md |
| `HtmlSandbox.tsx` | iframe security principles | DOMPurify only for fragments |
| Present | Reveal.js | — |
| Columns | dnd-kit | — |
| Main Layout | react-resizable-panels | Typability UI |

---

# 20. 当前开发顺序

不要按：

```text
Markdown 完成
↓
Mermaid
↓
LaTeX
↓
Search
↓
HTML
```

推进。

改成 Vertical Slice：

```text
Milkdown
↓
FlowNoteHtmlBlock
↓
Anchor
↓
block.json
↓
index.html
↓
iframe
↓
Save
↓
Close
↓
Reopen
```

然后：

```text
Image
↓
External Update
↓
IME
↓
Copy
↓
Failure Recovery
```

---

# 21. Vertical Slice 1

目标：

```text
Markdown A
↓
/html
↓
HTML A
↓
Markdown B
↓
Save
↓
Reopen
```

磁盘：

```text
Test.note/
├─ note.json
├─ content.md
└─ blocks/
   └─ A/
      ├─ block.json
      ├─ index.html
      └─ original.html
```

通过后才进入 Slice 2。

---

# 22. Vertical Slice 2

增加：

```text
Markdown Image
HTML local CSS
HTML local JS
Second HTML
```

验证资源模型。

---

# 23. Vertical Slice 3

增加：

```text
VS Code External Edit
IME
Duplicate Anchor
Missing Block
Orphan Block
Save Failure
Move Note
Deep Copy
```

通过：

> Note Format v1 Freeze。

---

# 24. 暂时禁止的开发行为

在 Format Freeze 前不要优先开发：

```text
AI
Columns
Slide
Speaker Notes
Graph
Cloud
Plugin System
Fancy Theme Normalization
CDN Auto Download
```

这些功能会分散目前最关键的问题：

> Mixed Note Reliability。

---

# 25. License 原则

复制或修改开源代码前：

1. 检查仓库 LICENSE
2. 保留需要保留的版权声明
3. 在 FlowNote Third-party Notices 中登记
4. 区分“借鉴思想”和“直接复制代码”

Milkdown 与其 examples 是 MIT；Markup 和 Hanshi 也公开采用 MIT。DOMPurify 当前仓库列出 Apache-2.0 / MPL-2.0 双许可；dnd-kit 和 reveal.js 为 MIT。使用前仍应以项目实际使用版本所附 LICENSE 为最终依据。

---

# 26. 开源借鉴的最终原则

> 不 Fork 一个大项目然后强行改成 FlowNote。

推荐：

```text
Milkdown
→ 编辑器能力

Markup
→ 桌面 Markdown 工程经验

Hanshi
→ Source Fidelity / IME / Sync

DOMPurify
→ HTML Sanitization

Reveal.js
→ Presentation

dnd-kit
→ Future Layout

FlowNote
→ 产品模型 + Note Format + HTML-native 知识体验
```

最终目标不是拼凑一个 Markdown Editor，而是：

> 用成熟组件缩短基础设施开发时间，把主要精力放在 FlowNote 独有的 Markdown + HTML 混合文档体验上。