# FlowNote 技术验证 Demo

FlowNote 是 Document-first 的 Markdown + HTML 混合笔记原型。

**当前交付：第四阶段普通 Markdown 文件操作，功能、自动验收与 Windows 发布构建 completed。** 已接通真实打开、保存、另存为、重载和关闭重开；完整 Markdown Editor Qualification 仍为 pending，剩余原生文件交互、视觉与真实输入法验收。见[第四阶段报告](../flownote-markdown-qualification/markdown-files-result-2026-09-14.md)。

桌面 Gate 收尾已补充 Tauri 命令分发与关闭事件检查，并修复最终销毁窗口期间仍可输入的丢失风险。最后关闭前锁定编辑，关闭失败恢复原来的模式与历史；普通保存时仍可继续输入。

默认页现在是可直接编辑的“项目周记”，提供：

- 标题、粗体、斜体、删除线、链接、引用、行内代码和代码块工具栏。
- 列表缩进 / 退回、任务勾选、表格增删行列，以及表格末格 Tab 自动加行。
- 常用代码语言高亮，代码块 Tab / Shift+Tab 缩进。
- 撤销 / 重做、中文组合输入保护、首次修改后的关闭提示。
- Windows 桌面版提供新建、打开、保存、另存为、重载和关闭；Ctrl+O / Ctrl+S / Ctrl+Shift+S 对应文件操作，并显示当前文件与未保存状态。
- 网页版导入文件副本，通过“导出 Markdown”或 Ctrl+S 下载；下载不会清除未保存状态。
- 上方“可视化 / 源码”切换；源码可编辑、撤销 / 重做，输入法冲突保留当前与外部两个版本供选择。
- “图片”工具栏，可填写 HTTP(S) 地址或相对路径及替代文字；插入可撤销，列表中的图片保留父项与路径。
- 普通粘贴识别 Markdown 列表、代码块和行内格式；Ctrl+Shift+V 保留纯文本。代码上下文和普通文字空格保持完整。

图片功能当前为地址插入。相对路径需要对应资源可访问，本地图片文件选择导入与资源复制 / 保存尚未实现。

含 Frontmatter、WikiLink、脚注、HTML 原文、公式、Mermaid、自定义代码块或指令的文档会显示保护原因。源码导出读取当前编辑结果；未改动部分保留原来的 BOM 与换行符。移除风险语法后可主动切回可视化，切换前会检查往返语义。公式和 Mermaid 当前保留源码，尚未排版渲染。

单独删除 Markdown 表头会被明确拒绝，可以编辑表头文字。普通导出不处理 Mixed Note。任意正文颜色、Mermaid / LaTeX 渲染、资源保存和真实磁盘自动保存不属于本阶段完成项。

可重复运行写作、内容保护和资格测试：

```bash
npm run test:stage-one
npm run test:protection
npm run test:qualification
npm run test:qualification-assets
npm run test:files
npm run test:files:disk
npm run test:desktop
```

当前写作 27 项、内容保护 38 项、图片 / 列表 / 粘贴 36 项、资源 HTTP 4 项、文件会话 16 项、App 到磁盘 13 项、Rust 文件 23 项、Tauri 命令 9 项、关闭事件 12 项通过，共 178 项。磁盘 / 桌面测试需要 Windows 和已配置的 Rust 工具链，运行无窗口测试进程并实际调用生产文件服务；系统事件与窗口销毁由明确测试边界替代。见[文件验收报告](../flownote-markdown-qualification/markdown-files-result-2026-09-14.md)。自动检查与 25 项完整资格用例不能互相替代。

## 文档入口与基线

- [当前状态与下一步（STATUS.md）](./STATUS.md)：当前实现、验证证据和执行顺序的统一入口。
- [开发验收清单（CHECKLIST.md）](./CHECKLIST.md)：使用 pending / in_progress / completed 跟踪门槛。
- [PRD v0.3 — V1 Baseline](<../FlowNote PRD v0.3 — V1 Baseline.md>)：产品范围与 V1 成功标准。
- [Note Format v1.1 — Freeze Candidate](<../FlowNote Note Format v1.1 — Freeze Candidate Draft.md>)：持久化规范；文档修订号是 v1.1，磁盘字段仍为 `formatVersion: 1`，格式尚未冻结。
- [Open Source Development Guide v0.1](<../FlowNote Open Source Development Guide v0.1.md>)：开源参考与后续 Slice 1 / 2 / 3 顺序。

[旧 PRD v0.2](<../PRD v0.2 — 核心架构与需求决策.md>)、[SUMMARY.md](./SUMMARY.md)、[PROGRESS.md](./PROGRESS.md)、[ARCHITECTURE.md](./ARCHITECTURE.md) 和[旧测试进度](./测试当前进度.md)保留作历史参考。其中的完成比例、类型错误、双击 HTML 编辑及功能排期不作为当前验收结论；范围与格式以以上基线为准。

## Markdown 资格测试

已有[测试包](../flownote-markdown-qualification/README.md)，包含 8 份 Markdown 样例及 25 项用例（21 项 P0、4 项 P1），直接复用：

- [资格规则与用例](../flownote-markdown-qualification/markdown-editor-qualification.md)
- [结果模板](../flownote-markdown-qualification/markdown-editor-qualification-result-template.md)
- [2026-09-13 当前资格报告](../flownote-markdown-qualification/markdown-editor-qualification-result-2026-09-13.md)
- [2026-09-14 文件流程与 R01 / R02 补充验收](../flownote-markdown-qualification/markdown-files-result-2026-09-14.md)
- [测试图片准备说明](../flownote-markdown-qualification/fixtures/qualification.assets/README.md)

测试包属于测试资产，不是产品功能模块。开发模式侧栏 **Markdown Gate** 支持选择文件 → 装载原文 → 编辑 / 采集 → 重载或导出。`list-image.png` 已补齐，并仅由开发服务器在原相对路径提供；生产包不携带测试图片。25 项资格用例的当前证据和缺口已逐项记录。

此前发现的 05 / 08 样例 Frontmatter 改写和 WikiLink 转义，已由第二阶段源码保护修复并使用原样例复测。当前 8 份全部通过编辑器层的往返检查；源码模式快照明确记录 activeEditor:source、document:null 和真实文本框内容，不采集隐藏的旧富文本结构作为当前文档。具体证据及未验证范围见 [STATUS.md](./STATUS.md)。

每项用例保留输入 Markdown、编辑器视觉结果、必要的 ProseMirror 结构 / DOM，以及序列化 Markdown。必须使用 FlowNote 实际的编辑器、插件、CSS 和同步链路。语义往返是门槛；等价的缩进、项目符号和编号规范化不自动判失败。

当前执行顺序：

1. 在实际浏览器 / WebView 检查源码与可视化切换、长文滚动、复杂列表和导出。
2. 使用真实中文输入法完成段落 / 列表 / 源码编辑。
3. 实机检查原生文件选择器、另存覆盖确认、窗口关闭和 WebView IPC；R01 / R02、Tauri 命令分发及关闭保护的自动检查已完成。
4. 完成剩余记录并作出 Gate 决策，然后进入 HTML Block Slice 1：Markdown + HTML → 保存 → 关闭 → 重开。

测试入口的导出 / 重新装载用于编辑器往返证据；产品保存由文件工具栏与 Rust 文件服务负责。进入 Gate 会解除原文件绑定，并检查未保存内容。HTML Block、`.note`、sandbox 与图片资源持久化留在后续切片。

## 当前实现与验证

- 已接入 Milkdown commonmark / gfm、history、prism、任务复选框、工具栏、同步标脏与内容监听。
- 编辑器已实现现有 `getMarkdown` / `setMarkdown` / `setMode` / `insertImage` 接口，保持稳定实例；输入、粘贴、源码与导出边界均有回归，HTML NodeView 尚未注册。
- 主页面使用真实文件服务；保存核对外部版本，失败保留当前正文及可用恢复路径。严格 UTF-8、2 MiB 上限，保存保留 BOM / 换行；不支持保留的特殊文件元数据明确报错。
- 2026-09-14 共 178 项自动检查、类型检查、Rust Clippy 和 Windows 发布构建通过；原生选择器、布局与真实 IME 仍待实机验收。构建命令为 `npm run tauri -- build --no-bundle`，未运行生成的程序。

详细证据与待办见 [STATUS.md](./STATUS.md)。

## 技术栈

- 桌面框架：Tauri 2.x
- UI：React 18 + TypeScript
- Markdown：Milkdown 7.22.1（本次本地安装版本）
- 状态管理：Zustand
- 构建工具：Vite 6

## 快速开始 (Windows)

### 使用批处理脚本

1. 双击[检查环境](./检查环境.bat)。
2. 双击[启动开发环境](./启动开发环境.bat)运行 Tauri 桌面应用。
3. 或双击[启动 Web 版本](./启动Web版本.bat)运行前端原型。

### 使用命令行

从仓库根目录进入应用目录：

```bash
cd flownote-app
npm install
```

仅启动 Web 前端：

```bash
npm run dev
```

启动 Tauri 桌面应用：

```bash
npm run tauri:dev
```

构建前端 / 桌面应用：

```bash
npm run build
npm run tauri:build
```

当前 Windows 可执行文件位于[flownote.exe](./src-tauri/target/release/flownote.exe)。本次生成可执行文件，未打安装包。启动应用后可通过文件工具栏操作普通 Markdown；资格测试单独执行。

## 当前代码入口

- [App](./src/app/App.tsx)：当前编辑器 / 状态演示入口。
- [FlowNoteEditor](./src/editor/FlowNoteEditor.tsx)：Milkdown 适配层。
- [文件会话](./src/files/documentSession.ts)和[原生文件端口](./src/files/nativeFilePort.ts)：文件切换、串行保存及未保存保护。
- [Rust 文件服务](./src-tauri/src/markdown_files.rs)与[Windows 提交](./src-tauri/src/windows_save.rs)：真实磁盘内容与版本、权限及恢复处理。
- [HTML 插件](./src/editor/plugins/htmlBlock/htmlBlockPlugin.ts)：当前仅注册 Node。
- [Tauri 主程序](./src-tauri/src/main.rs)：已注册普通 Markdown 文件命令；`.note` 包与自动保存的遗留入口明确报未实现。

文件树、编辑器、Inspector 三栏是 V1 目标布局；旧组件的存在不代表当前入口已经完成该产品流程。

## Gate 之后

依次完成开发指南中的 Slice 1（Markdown + HTML 保存 / 关闭 / 重开）、Slice 2（图片与 Block 私有资源）、Slice 3（外部修改、IME、异常恢复、移动与深复制），通过格式冻结测试后再标记 Format Final。

Read、文件树、搜索、全屏及导出仍按 PRD 完成 V1 验收。AI、Columns、Note Slide、Speaker Notes、主题改写和 CDN 自动下载暂缓；Mermaid / LaTeX 的渲染增强属于后续候选，本轮先验证源码不丢失。
