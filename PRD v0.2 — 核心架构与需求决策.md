# PRD v0.2 — 核心架构与需求决策

## 1. Note 文件模型

产品采用 **Markdown + 混合 Note 双格式体系**。

### 1.1 纯 Markdown 笔记

普通笔记继续保存为：

```text
xxx.md
```

优势：

- 完全开放
- 可被 Obsidian、Typora、VS Code 等软件直接读取
- 即使本软件停止维护，笔记仍然存在
- 方便 Git 管理

---

### 1.2 混合笔记

当一篇笔记同时包含：

- Markdown
- HTML Block
- Columns
- Slide
- 特殊布局

则使用自定义：

```text
xxx.note
```

`.note` 本质不是不可读数据库，而是一个结构化笔记包。

建议结构：

```text
CTS优化.note/
│
├─ note.json
├─ content.md
│
├─ blocks/
│   ├─ html_001.html
│   ├─ html_002.html
│   └─ ...
│
└─ assets/
    ├─ CTS优化_img_001.png
    ├─ CTS优化_img_002.svg
    └─ ...
```

其中：

`note.json`

记录：

- Block 顺序
- Columns 布局
- Slide 信息
- Theme
- Tags
- Metadata
- HTML Block 配置

`content.md`

保存主要 Markdown 内容。

`blocks/*.html`

保存独立 HTML Block。

`assets/`

保存图片和附件。

---

## 2. Markdown 文件保持独立

纯 Markdown 内容始终可以独立保存成：

```text
.md
```

用户不使用 HTML、Columns 等增强能力时，不强制转换为 `.note`。

当用户在 `.md` 中第一次插入 HTML Block 等高级内容时，软件提示：

> 当前笔记需要升级为混合笔记。

执行：

```text
xxx.md
   ↓
xxx.note
```

原 Markdown 内容继续保留在：

```text
content.md
```

---

# 3. HTML Block 独立保存

每个 HTML Block 保存成独立：

```text
.html
```

例如：

```text
blocks/
├─ html_001.html
├─ html_002.html
└─ html_003.html
```

优势：

- 可以单独修改
- 可以独立打开
- 可以复制出去
- 可以使用 VS Code 修改
- AI 可以只修改某一个 HTML
- 不需要重写整个 Note

HTML Block 本质上是：

> Note 对一个 HTML 子文件的引用。

---

# 4. 图片与附件

图片采用本地存储。

每篇 Note 有自己的：

```text
assets/
```

例如：

```text
CTS优化.note/
└─ assets/
    ├─ CTS优化_img_001.png
    ├─ CTS优化_img_002.png
    ├─ CTS优化_flow_001.svg
    └─ CTS优化_attachment_001.pdf
```

文件名自动与当前 Note 关联。

用户无需手动管理文件名。

支持：

- Ctrl + V 截图
- 拖入
- 文件选择
- SVG
- PNG
- JPG

删除 Note 时软件需要知道哪些附件属于该 Note。

---

# 5. Markdown 编辑模式

默认采用：

> **所见即所得**

体验接近：

- Typora
- Obsidian Live Preview

同时在设置中提供：

```text
Markdown 编辑模式

● 所见即所得
○ Markdown Source
○ 分栏：Source + Preview
```

用户可设置全局默认模式，也可以针对单篇 Note 临时切换。

---

# 6. HTML Block 编辑交互

HTML Block 正常状态直接显示最终效果。

### 单击

选中 HTML Block。

出现工具栏：

```text
HTML     原始 | 主题 | 标准化

编辑
全屏
演示
导出
⋯
```

### 第一次双击

弹出快速编辑窗口：

```text
┌───────────────────────────┐
│ html_001.html             │
├───────────────────────────┤
│ <div>...</div>            │
│                           │
├───────────────────────────┤
│ 保存       完整编辑 ↗     │
└───────────────────────────┘
```

适合修改少量：

- 文字
- 数值
- 标题
- CSS

### 再次双击 / 完整编辑

正式打开：

```text
html_001.html
```

作为编辑器 Tab。

此时：

```text
HTML Source        Preview
```

可选择：

- 源码
- 预览
- 左右分栏

---

# 7. Columns

Columns 支持自由拖拽。

包括：

### Block 拖拽

```text
Markdown
Image
HTML
Code
```

可以直接拖入不同 Column。

### 调整宽度

例如：

```text
50% | 50%
```

可拖成：

```text
35% | 65%
```

### 支持

```text
2 Columns
3 Columns
```

后续可扩展 Grid。

---

# 8. HTML JavaScript 策略

AI 给出的 HTML 有时会带：

```html
<script>
```

JavaScript 能实现：

- 动画
- 图表交互
- 点击效果
- 页面切换
- ECharts
- Reveal.js
- 自定义交互

但 JavaScript 也可能执行不希望发生的操作。

因此采用：

> **Sandbox 隔离运行，而不是直接把 HTML 注入软件主界面。**

完整 HTML 默认运行在独立安全容器中。

---

## 8.1 默认模式

默认：

```text
HTML Sandbox
```

HTML 无权直接：

- 操作笔记软件界面
- 读取其他 Note
- 操作本地文件
- 调用软件内部 API
- 访问用户数据库

---

## 8.2 JavaScript 开关

HTML Block 设置中提供：

```text
JavaScript

● 自动安全运行
○ 禁止 JavaScript
○ 高级模式
```

对于普通用户：

> 不需要理解 JavaScript。

软件自己处理。

---

# 9. CDN 与外部资源

AI 经常生成类似：

```html
<script src="https://cdn..."></script>
```

或者：

```html
<link href="https://fonts...">
```

这些可能用于：

- ECharts
- Tailwind
- Mermaid
- FontAwesome
- Google Fonts
- Reveal.js

如果完全禁止联网，很多 AI HTML 会直接变丑或者无法运行。

但如果永远依赖 CDN：

- 离线无法使用
- CDN 失效后笔记损坏
- 存在隐私问题
- 不符合 Local First

因此产品采用：

> **检测 → 本地化优先**

---

## 9.1 粘贴 HTML 时

例如检测到：

```text
检测到 4 个外部资源

• ECharts
• Tailwind
• FontAwesome
• Google Fonts
```

提示：

```text
推荐：下载依赖到本地

[本地化并保存]
[临时联网运行]
[保持离线]
```

默认推荐：

> 本地化并保存

---

## 9.2 本地化以后

例如：

```text
assets/libs/
├─ echarts.min.js
├─ tailwind.css
└─ icons.css
```

HTML 自动改成引用：

```text
./assets/libs/...
```

这样这篇 Note：

> 即使以后没有互联网也可以完整展示。

这非常符合产品 Local First 的原则。

---

# 10. 外部字体

AI HTML 中声明：

```text
Arial
Inter
Roboto
Google Fonts
Microsoft YaHei
```

默认映射为软件本地字体系统。

例如：

```css
--font-body
--font-heading
--font-code
```

HTML Theme Adaptation 后统一使用这些变量。

因此：

> AI HTML 不因为原始字体不同而破坏整个知识库视觉一致性。

原始 HTML 模式仍可保留原始字体设置。

---

# 11. HTML 自动响应宽度

HTML Block 默认：

```text
Responsive
```

根据 Note 正文区域自动适应。

例如窗口：

```text
1600px
1200px
800px
```

HTML 自动变化。

但需要区分两种内容。

### 普通 HTML

响应容器宽度。

### Slide HTML

保持：

```text
16:9
```

等比例缩放。

避免 PPT 页面因为窗口变化而重新排版。

---

# 12. PPT / Slide 分页

默认采用：

> 用户定义分页。

原因：

AI 生成用于演示的 HTML 往往已经设计好了分页和内容结构。

软件不应该擅自重新切页。

---

# 13. Note 自定义 Slide

一篇 Note 可以定义自己的 Slide。

例如：

```text
Slide 1
├─ Markdown
└─ HTML

Slide 2
└─ HTML

Slide 3
├─ Markdown
├─ Image
└─ HTML
```

允许：

- 调整 Slide 顺序
- 添加 Slide
- 删除 Slide
- 拖入 Block
- 修改背景
- 单独设置布局

---

# 14. Speaker Notes

每一页 Slide 支持：

```text
Speaker Notes
```

演示时：

观众看到：

```text
Slide
```

Presenter View 看到：

```text
当前 Slide

Speaker Notes

下一页预览

计时
```

用于：

- 答辩
- 汇报
- 教学
- 演讲

---

# 15. HTML 标准化

V1 不依赖 AI。

优先采用：

```text
CSS Parser
+
Theme Token
+
Design System
+
Rule Mapping
```

完成：

- 字体统一
- 主色替换
- Background
- Radius
- Shadow
- Spacing
- Border
- Responsive

例如：

```css
#2563eb
```

转换为：

```css
var(--accent)
```

这样 Theme 切换即可改变 HTML 风格。

---

# 16. AI HTML 能力

AI 是明确的后续核心能力。

包括：

### 重新设计

用户选择 HTML Block：

```text
AI
↓
重新设计此 HTML
```

例如：

```text
让它更适合技术答辩
```

或者：

```text
改成白底蓝色的学术风格
```

---

### HTML 修复

例如：

```text
这个图在窗口缩小时显示不全
```

AI 自动修改。

---

### HTML 转换

例如：

```text
把这张纵向流程图改成横向三栏结构
```

---

### 内容更新

例如：

```text
把 WNS 从 -88ps 改成 -47ps，
并突出显示改善幅度。
```

只修改当前 HTML Block。

---

### 标准化增强

规则系统无法判断：

```text
box-a
wrapper-x
item-27
```

是什么组件时，可让 AI 判断：

```text
Metric
Card
Flow
Comparison
Callout
```

再映射到 Design System。

---

# 17. HTML 数据保护

每个 HTML Block至少保存：

```text
Original
Current
Theme Adapted
```

例如：

```text
html_001.original.html
html_001.html
```

保证：

> 任何 AI 修改、主题转换、标准化都可以撤销。

---

# 18. 更新后的产品数据结构

最终：

```text
Workspace
│
├─ 普通 Markdown
│   └─ xxx.md
│
└─ Mixed Note
    └─ xxx.note/
        │
        ├─ note.json
        ├─ content.md
        │
        ├─ blocks/
        │   ├─ html_001.html
        │   ├─ html_001.original.html
        │   ├─ html_002.html
        │   └─ ...
        │
        └─ assets/
            ├─ images/
            ├─ attachments/
            └─ libs/
```

这是当前推荐的核心文件模型。

---

# 19. V1 / 后续版本重新划分

## V1

重点验证：

### Markdown

- 所见即所得
- `.md`
- 图片
- Code
- Mermaid
- LaTeX

### HTML

- 粘贴 HTML
- HTML Block
- Full Page
- Sandbox
- 独立 `.html`
- HTML 编辑
- 响应式展示
- 原始版本保存

### Mixed Note

- `.note`
- Markdown + HTML
- Columns
- 图片

### 管理

- Folder
- Tag
- Search
- Outline

### 展示

- Read
- Present
- 自定义 Slide
- Speaker Notes

### Theme

- Theme Token
- 基础主题适配

---

## V1.5

- HTML 外部依赖自动检测
- CDN 本地化
- HTML 标准化增强
- Presenter View
- 自定义 Theme

---

## V2

重点进入 AI：

- AI 重新设计 HTML
- AI 修复 HTML
- AI 修改 HTML
- AI 标准化
- AI 生成 Block
- AI 从 Markdown 生成展示页面
- AI 从 Note 生成 Slides

---

# 20. 当前产品原则

经过本轮讨论后，确定以下原则：

> Markdown 不被自定义格式绑架。

> HTML 不只是预览，而是可以长期保存的内容。

> HTML Block 本身就是独立文件。

> 混合能力通过 `.note` 提供。

> Block 服务于 Markdown 和 HTML 共存，而不是取代 Markdown。

> 用户不需要理解 HTML、CSS、JavaScript 和 CDN。

> 软件负责把 AI 给出的 HTML 安全地收进来。

> 能本地化的外部资源尽量本地化。

> 原始 HTML 永远保留。

> 演示内容由用户决定分页。

> HTML、Note 和 Slide 都可以成为 AI 后续操作的对象。

---

## 当前产品核心路径

```text
Markdown 写作
       │
       ├────────────┐
       │            │
       ↓            ↓
普通 .md        AI 生成 HTML
                    │
                  Ctrl+V
                    │
              自动识别 HTML
                    │
              创建 HTML Block
                    │
           保存独立 .html 文件
                    │
        Markdown + HTML 混合 Note
                    │
             .note 文件包
                    │
        ┌───────────┼───────────┐
        ↓           ↓           ↓
       阅读        展示        Slide
                                │
                         Speaker Notes
```