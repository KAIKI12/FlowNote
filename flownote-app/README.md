# FlowNote 技术验证 Demo

FlowNote 是一个 **Document-first 的 Markdown + HTML 混合笔记原型**。当前已经完成 Markdown Gate，以及 HTML Block / `.note` Vertical Slice 1、Slice 2、Slice 3 的当前实现范围；下一阶段进入 **Format Freeze + V1 产品收尾**。

当前主能力包括：

- Markdown 可视化 / 源码双模式编辑，复杂列表、任务列表、表格、代码、图片、粘贴、撤销 / 重做与中文 IME 保护。
- Frontmatter、WikiLink、脚注、raw HTML、Mermaid、LaTeX 等无法安全富文本往返的语法走源码保真路径，不静默丢失。
- Windows 普通 `.md` 文件的新建、打开、保存、另存为、重载、关闭 / 重开，以及外部版本检测、冲突与失败恢复。
- Mixed Note 使用开放 `.note` 目录格式，支持 `content.md`、`note.json`、多个 HTML Block、Block Current / Original 与 managed resources。
- HTML Block 已注册 NodeView，在 Markdown 原位置通过隔离 iframe 渲染；默认 sandbox + CSP，网络默认关闭。
- Markdown managed images 与 HTML Block 私有 CSS / JS / Image 已接入 capability-bound resource reader；持久化仍保存相对路径，不写入 Host 绝对路径或 runtime URL。
- 外部修改采用 Clean / Dirty / IME 三态处理：Clean 自动 reload，Dirty 显式 conflict，composition 期间先 queue，结束后重新检查版本。
- Missing / Orphan 条件支持显式 repair，不自动删除资源或正文。
- same-note HTML Block Deep Copy 已实现，复制 Block-private assets 并生成新 Block ID。
- shared read-only probe / resource snapshot 与 disposal guard 已覆盖资源只读检查、关闭 / 切换及迟到异步回执边界。

公式与 Mermaid 当前保证源码保留，渲染增强仍属于后续候选。

## 当前验证基线

2026-09-16 当前验证结果：

- HTML：**11 / 11**
- Stage One：**47 / 47**
- Protection：**38 / 38**
- Qualification：**36 / 36**
- Files：**17 / 17**
- 真实磁盘：**16 / 16**
- Desktop UI：**12 / 12**
- Desktop IPC：**10 / 10**
- Note Rust：**28 / 28**
- Rust Clippy：**PASS**
- Frontend build：**PASS**
- Tauri build：**PASS**

当前主 bundle 约 **819.62 kB**。体积与 code splitting 属于 V1 收尾项，不改变当前功能验证结论。

## 文档入口与基线

- [STATUS.md](./STATUS.md)：当前实现、验证证据和下一阶段的统一入口。
- [CHECKLIST.md](./CHECKLIST.md)：当前完成项与 Format Freeze / V1 收尾清单。
- [PRD v0.3 — V1 Baseline](<../FlowNote PRD v0.3 — V1 Baseline.md>)：产品范围与 V1 成功标准。
- [Requirements Matrix](../REQUIREMENTS-MATRIX.md)：最终需求、当前覆盖状态与后续需求的防回归记录。
- [Note Format v1.2 — Freeze Candidate](<../FlowNote Note Format v1.2 — Freeze Candidate Draft.md>)：当前持久化规范；文档修订号为 v1.2，磁盘字段仍为 `formatVersion: 1`。
- [Resource Architecture](../docs/superpowers/specs/2026-09-15-resource-architecture-design.md)：Block-private / Note-managed / Shared localized resources 与 Runtime Resolver 的长期边界。
- [Open Source Development Guide v0.1](<../FlowNote Open Source Development Guide v0.1.md>)：开源参考与开发顺序。

Slice 的 completed 只表示该 Slice 的当前实现范围完成，**不会自动把 Requirements Matrix 中所有 Planned / Partial 项变成 completed**。

当前明确保留在后续需求中的内容包括：

- cross-note managed dependency copy；
- Shared Localized Resource；
- CDN Localization；
- `@import`、动态 `fetch()`、module import、Worker / WASM 等更广 resolver；
- 更完整的 Trash / 删除恢复与共享资源冲突处理。

## 当前实现概览

### Markdown

- Milkdown commonmark / gfm、history、prism、任务列表、表格与工具栏已接入。
- `getMarkdown` / `setMarkdown` / `setMode` / `insertImage` / HTML candidate API 已实现。
- 源码保护覆盖 Frontmatter、WikiLink、脚注、raw HTML、Mermaid、LaTeX、未知 fence / meta / directive。
- 普通 `.md` 文件支持真实磁盘打开 / 保存 / Save As / reload / close / reopen。

### Mixed Note / `.note`

- 显式 `.md → .note` 转换保留原 `.md`。
- `content.md` 是正文与线性顺序唯一事实来源；`note.json` 不重复保存正文。
- HTML Block 使用稳定 Block ID，Current 为 `index.html`，Original 为 `original.html`。
- Markdown managed images 保存到 `.note/assets/images/**`。
- HTML Block 私有资源保存到 `blocks/<id>/assets/**`。
- 整个 `.note` 移动到新目录后可重新打开，managed references 仍保持可用。

### HTML Block

- HTML NodeView 已注册并实际参与编辑器运行时。
- iframe 使用 `srcdoc` + sandbox + CSP 隔离。
- Current / Original 独立；普通编辑不覆盖 Original。
- 多个 Block 的资源与持久化状态相互独立。

### 外部修改 / 修复 / 复制

- Clean：外部变化自动 / 轻提示 reload。
- Dirty：进入显式 conflict，不做 last-write-wins。
- IME：composition 期间外部变化 queue，结束后重新验证 revision。
- Missing / Orphan：显式诊断与 repair，不静默删除。
- same-note Deep Copy：新 ID + private assets 独立复制。
- disposal guard：关闭 / 切换 / capability 释放后，旧异步结果不能重新污染当前会话。

## 测试命令

可重复运行主要测试：

```bash
npm run test:html
npm run test:stage-one
npm run test:protection
npm run test:qualification
npm run test:files
npm run test:files:disk
npm run test:desktop
```

Rust / 构建验证：

```bash
cargo clippy -- -D warnings
npm run build
npm run tauri:build
```

具体测试边界与当前数字以 [STATUS.md](./STATUS.md) 和 [CHECKLIST.md](./CHECKLIST.md) 为准。

## 技术栈

- 桌面框架：Tauri 2.x
- UI：React 18 + TypeScript
- Markdown：Milkdown 7.22.1
- 状态管理：Zustand
- 构建工具：Vite 6

## 快速开始（Windows）

从仓库根目录进入应用目录：

```bash
cd flownote-app
npm install
```

启动 Web 前端：

```bash
npm run dev
```

启动 Tauri 桌面应用：

```bash
npm run tauri:dev
```

构建：

```bash
npm run build
npm run tauri:build
```

Windows 可执行文件位于：

```text
flownote-app/src-tauri/target/release/flownote.exe
```

## 当前代码入口

- [App](./src/app/App.tsx)：主应用入口与文件 / Note 会话编排。
- [FlowNoteEditor](./src/editor/FlowNoteEditor.tsx)：Milkdown 适配层。
- [editorRuntime](./src/editor/editorRuntime.ts)：Markdown / HTML / managed image NodeView 与运行时插件配置。
- [documentSession](./src/files/documentSession.ts)：普通 Markdown 文件会话。
- [nativeNotePort](./src/note/nativeNotePort.ts) / [useMixedNoteFiles](./src/note/useMixedNoteFiles.ts)：Mixed Note 打开、保存、冲突与生命周期。
- [HTML Block plugin](./src/editor/plugins/htmlBlock/htmlBlockPlugin.ts)：HTML Block schema / command / NodeView 接入。
- [Rust Markdown backend](./src-tauri/src/markdown_files.rs)：普通 `.md` 文件后端。
- [Rust Note backend](./src-tauri/src/note_files.rs) / [note_commands](./src-tauri/src/note_commands.rs)：`.note` 持久化、resource capability 与 repair / copy 相关后端。

## 下一阶段：Format Freeze + V1 产品收尾

接下来统一围绕 V1 可交付性收尾，不再继续扩张 Slice：

1. **Format Freeze**：完成最终格式冻结测试，确认未知版本只读、Missing / Orphan、失败恢复、Deep Copy、外部修改和移动后重开等不变量。
2. **Read**：完成独立阅读模式。
3. **文件树 / 搜索**：完成 V1 文件组织与基础搜索。
4. **HTML Fullscreen**：完成 HTML Block 全屏展示路径。
5. **Browser Bundle / Markdown export**：明确 Mixed Note 的可移植导出语义，不静默丢失 HTML 或 managed resources。
6. **产品收尾**：UI 一致性、错误提示、空状态、bundle 体积与最终发布验证。

Shared Localized Resource、CDN Localization、cross-note managed dependency copy 等需求继续由 [REQUIREMENTS-MATRIX.md](../REQUIREMENTS-MATRIX.md) 保留，后续单独实现，不因当前 Slice 完成而删除。
