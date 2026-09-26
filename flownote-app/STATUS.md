# FlowNote 当前状态

**更新时间：2026-09-26**

**当前阶段：V1 基线能力与发布收尾保持稳定；V1.1 Visual Library Slice 1–3 已完成当前定义范围，并已与 2026-09-26 的编辑体验 / Workspace Trash 基线集成。Visual Library 现支持收藏复用、metadata 管理、可恢复 Library Trash，以及显式 Make Local 的静态 HTTPS 资源本地化；真实 Files Sidebar 支持 Workspace-local Trash / Restore / Permanent Delete 与 folder `New Note Here`；HTML 主入口为 `Add Visual`，标准 Dollar LaTeX 已回到可视化编辑。Note-shared `assets/shared/**`、跨 Note shared dependency copy、完整 `@import` / module / dynamic fetch 等仍保留为后续需求。**

**范围原则：Slice 完成只表示当前切片定义的实现与验证范围完成，不删除最终需求。Shared Localized Resource、CDN Localization、cross-note managed dependency copy 等尚未实现的能力继续由 [REQUIREMENTS-MATRIX.md](../REQUIREMENTS-MATRIX.md) 保留。**

## 1. 当前产品能力

FlowNote 当前已经从“Markdown 编辑器验证”进入可持续收尾阶段，现有主路径包括：

- 普通 Markdown：可视化 / 源码双模式、复杂列表、任务列表、表格、代码、图片、粘贴、撤销重做、中文 IME 保护；Frontmatter 作为原字节元数据包络保留且正文可继续可视化编辑，任意 fenced code language 可按普通代码块安全往返；真正无法安全往返的扩展语法继续走源码保真路径。
- 普通 `.md` 文件：新建、打开、保存、另存为、重载、关闭 / 重开、外部版本检测与失败恢复；无编辑保存保持原字节与时间语义。Workspace 删除改为移动到隐藏 `.flownote-trash`，可按原路径恢复或显式永久删除。
- Mixed Note：显式 `.md → .note` 转换、`content.md` + `note.json` + Block 目录持久化、多个 HTML Block、关闭重开与整体移动。
- HTML Block：NodeView 已注册并在 Markdown 原位置渲染隔离 iframe；Current / Original 分离，Block 配置与私有资源独立持久化，默认 sandbox + CSP 阻止联网。
- Managed resources：Markdown managed images、`assets/images/**`、HTML Block 私有 `blocks/<id>/assets/**`、CSS / JS / Image 与 CSS `url()` 运行时解析均已接通；持久化 Source 保持相对路径，不写入 runtime data URL 或 Host 绝对路径。
- 外部修改保护：已经形成 Clean / Dirty / IME 三态处理。Clean 状态检测到外部修改时自动 reload；Dirty 状态进入明确 conflict；composition 期间先 queue，结束后重新检查版本再决定应用。
- Repair：Missing / Orphan 条件可诊断并进入显式修复流程，不静默删除资源或改写正文；异常恢复保持 recoverability。
- Deep Copy：same-note HTML Block Deep Copy 已实现，生成新 Block ID，并复制对应 Block-private assets，避免隐藏共享可变资源。
- 资源安全：capability-bound reader 拒绝 `..`、绝对路径、反斜杠绕过、跨 Block、伪造 capability、外部 revision 变化与 symlink escape。
- 共享资源保护基础：已补 shared read-only probe / resource snapshot，用于识别共享或外部资源变化并避免把不可安全写回的对象当成普通可写资源。
- 生命周期保护：disposal guard 已覆盖关闭 / 切换 / 异步回执边界，避免已释放编辑器、Note capability 或旧会话的迟到结果重新写入当前文档。

标准 `$...$` / `$$...$$` LaTeX 已接入 Milkdown math 并可在可视化编辑器中直接编辑；`\\(...\\)` / `\\[...\\]` 仍走源码保护。Mermaid 继续保证源码不丢失，其可视化增强仍属于后续候选。

## 2. Slice 状态

| Slice | 状态 | 当前完成范围 |
|---|---|---|
| Slice 1 | completed | Markdown + HTML → `.note` 持久化 → Close → Reopen；显式 HTML Visual 导入（当前 UI 为 `Add Visual`）、Current / Original、NodeView / iframe、Ctrl+S、Dirty 关闭保护。 |
| Slice 2 | completed | Markdown managed images、Block 私有 CSS / JS / Image、第二 HTML Block、capability reader、整体移动后重开、保存失败回滚与资源相对路径。 |
| Slice 3 | completed（当前范围） | Clean 自动 reload、Dirty conflict、IME queue、Missing / Orphan repair、same-note Deep Copy、shared read-only probe / resource snapshot、disposal guard。 |

Slice 3 的 completed **不等于所有复制与共享资源需求完成**。以下仍保留在 Requirements Matrix：

- cross-note managed dependency copy；
- Shared Localized Resource；
- CDN Localization；
- `@import`、动态 `fetch()`、module import、Worker / WASM 等更广资源解析；
- Workspace Trash 之外的 Block/resource-level 删除恢复、共享资源冲突及未来迁移语义。

## 2.5 V1 UI 第一波 App 原型 — completed

2026-09-19 已把此前确认的 UI 草稿落到真实 React / Milkdown App，而不是单独的静态 demo：

- **App Shell**：极简 Topbar + 可折叠 Files Sidebar + 中央 Document + 按需 Inspector；默认仍以文档为视觉中心。
- **Markdown 连续编辑**：Markdown 没有 click-to-edit Block 心智；Edit / Focus 下正文可直接输入，Read 仅切换为同一文档的只读阅读状态。
- **Edit / Read / Focus**：Read 去除编辑噪声；Focus 自动隐藏左右栏并继续保持 Markdown 可编辑；三种模式不再互相重叠。
- **Files Sidebar**：New Note / Open 为直接入口，保存、另存、Mixed Note、导出等低频操作折叠到 File actions；真实本地文件树现支持 folder `New Note Here`、Rename、Move to Trash，并有独立 Workspace Trash 视图。
- **Inspector**：Outline / Block / Info 三个上下文 Tab 已接入；HTML Visual 选中后可打开 Block Inspector。
- **HTML Visual**：Normal / Hover / Selected 渐进控制已实现；Visual 支持 Normal / Wide / Full 的第一波展示交互，不把 Markdown 本身 Block 化。主入口使用 `Add Visual` / `Paste HTML source here…`，不要求用户先理解 `.note` 或 Block 内部术语。
- **HTML Quick Edit**：使用大尺寸 Source + Live Preview 双栏弹窗；保留现有 Current / Original 与快速编辑语义。其 `Open Full Editor` 入口现已接通真实 Full HTML Editor。
- **HTML Fullscreen**：当前 Visual 可进入独立展示层，FlowNote 工作区 chrome 隐藏，支持 Esc / Close 退出。
- **Light / Dark 基础主题**：第一波原型仅提供手动切换；后续 V1 UI Polish 已升级为 Auto / Light / Dark、系统主题联动和持久化显式偏好。

第一波原型当时未把静态演示能力伪装成完成项；其中真实 Workspace 文件树与基础搜索、Full HTML Editor、Browser Bundle、Mixed Markdown export 与最终 V1 UI Polish 均已在后续独立 Slice 完成。当前仅继续安装级发布收尾。

## 2.6 V1 Workspace Slice — completed

2026-09-19 已把第一波 Sidebar 产品壳接到真实本地 Workspace，并沿用现有 Markdown / Note capability，不引入第三套文档存储：

- **单 Workspace 绑定与恢复**：桌面端选择一个本地目录作为 Workspace；native 层持久化根目录，重启时恢复。根目录失效时回到 Choose Workspace，不静默改绑。
- **真实文件树**：扫描 `.md` / `.markdown` 与有效 `.note` package；`.note` 作为单一叶节点，不展开 `content.md`、`note.json` 或 Block 私有目录。隐藏项、symlink、`node_modules`、`target`、`dist` 不进入树。
- **路径安全**：UI 只持有 Workspace 相对路径；native 层拒绝绝对路径、`..`、反斜杠、drive/colon 绕过、NUL 与 symlink escape，并在 canonical Workspace root 内解析。
- **安全打开与切换**：Markdown 继续通过 `DocumentSession`，Mixed Note 继续通过 `NativeNotePort/useMixedNoteFiles`；Workspace 点击不会旁路 Dirty / IME / pending-save / capability release 保护。
- **跨类型切换修复**：修正 `DocumentSession.apply()` 在 `busy='switch'` 时过早执行 after callback 的时序问题；Markdown ↔ Note 的取消、放弃、成功切换都保持候选与旧 capability 的正确释放顺序。
- **New Note**：在当前选择文件夹创建 collision-free `Untitled.md`；首次尚未绑定 Workspace 时，一次点击即可完成“选择 Workspace → 创建 → 打开”。
- **Rename**：支持 folder / Markdown / Note package；省略后缀时保留 `.md` / `.note`；文件夹 rename 会同步迁移 selected folder、expanded path、active child 与 Recent 子路径，并通过正常 open 流重新绑定当前子笔记。
- **Recent**：按 Workspace ID 保存最近打开的相对路径与时间，最多 10 条；不复制内容，不成为第二事实来源。Refresh 会移除 Missing 项。
- **基础 Search**：native 层直接有界扫描 filename、一级标题、Markdown 正文、Note metadata title 与 `.note/content.md`；跳过超大文本和私有 Block assets，最多返回 100 条。**当前不是 SQLite/FTS 索引搜索。**
- **Quiet Technical Sidebar**：真实树采用紧凑行、高亮克制、More 菜单按 hover/focus 渐进出现；folder 菜单提供 `New Note Here` / Rename / Move to Trash，Markdown / `.note` 提供 Rename / Move to Trash；右键复用同一菜单。
- **Refresh / Trash 语义**：当前 V1 使用手动 Refresh，以及 create / rename / trash / restore / permanent-delete / change 后自动 rescan。Workspace 删除会原子移动到根目录隐藏 `.flownote-trash/<id>/`，记录原相对路径；Restore 只恢复到原位置，路径冲突或原父目录缺失时明确失败并保留 Trash payload；Permanent Delete 仅在 Trash 视图二次确认后执行。尚未加入递归 filesystem watcher。

当前仍未包含：真实 Favorites、Trash 批量清空 / 自定义恢复位置 / 自动清理策略、drag & drop move、多 Workspace、filesystem watcher、SQLite/FTS 索引、tags/backlinks/graph。Workspace Trash 已完成单条 Move / Restore / Permanent Delete；Block/resource-level 删除恢复仍由 Requirements Matrix 保留。Full HTML Editor 与导出能力已由后续独立 Slice 完成。

## 2.7 Note Format v1 Format Freeze — completed

2026-09-19 已完成 Note Format v1 的最终冻结，磁盘字段继续保持 `formatVersion: 1`，没有引入迁移或新格式字段：

- **独立 Freeze Gate**：新增 `npm run test:format-freeze`，统一验证 native Note format、atomic recovery、真实磁盘 roundtrip、Mixed Note / IME、Unsupported Markdown 与 HTML Anchor / Current / Original。
- **Crash / Failure**：partial Block（仅 `block.json` / 缺 `original.html`）进入只读可恢复状态，不自动删除残留文件；遗留 `.flownote-current-*.tmp` recovery 目录不会被正常 reopen 自动采用或删除。
- **Atomic recovery**：保存冲突后 current recovery 与 original recovery 都必须是可解析的完整 Note package，并分别保留本地候选与原磁盘数据。
- **Unknown Version**：future `formatVersion` 只读打开，禁止 save / save-as / rewrite / downgrade，未知字段与原字节保持在磁盘。
- **Missing / Duplicate / Orphan**：继续遵守“保留源码与资源、显式修复、不静默删除”的 v1 不变量。
- **生命周期回归修复**：冻结 Gate 发现 Deep Copy 保存后存在低概率 hydration echo 重新标 Dirty；根因定位为 Milkdown `markdownUpdated` 对 external snapshot 的规范化回声被误当成本地编辑。`EditorSession.receiveExternal()` 现在记录已安装可视化序列化作为 clean baseline；对应最小回归测试由 RED 转 GREEN，真实磁盘场景随后连续 10 / 10 通过。
- **文档状态**：`FlowNote Note Format v1.2` 已由 Freeze Candidate 升级为 **Final**；未来不兼容的磁盘语义必须使用新的 `formatVersion`。

## 2.8 Read / Focus / Fullscreen Hardening — completed

2026-09-19 已完成第一轮 V1 阅读 / 专注 / HTML 全屏硬化，不改变 Markdown / `.note` 持久化语义：

- **Read**：继续使用同一文档实例，只读时隐藏格式工具栏与编辑模式 chrome；Markdown 不生成第二套 Preview。
- **Focus**：保持 Markdown 可直接编辑；Files Sidebar 与 Inspector 暂时隐藏但原开关状态不被改写，退出 Focus 后恢复进入前的布局；Focus 内不再暴露会偷偷改变恢复状态的 Sidebar toggle。
- **HTML Fullscreen**：进入后焦点转移到退出按钮，背景应用 `inert` 并锁定 body scroll；Esc / Close 退出后恢复背景交互、原滚动状态与触发按钮焦点。
- **长文档**：App 保持 `100vh`，中央 workspace 与 editor shell 不外溢，滚动收敛在 Milkdown 内容 root，避免长文档把整个桌面壳撑高。
- **窄窗口**：对小宽度 / 小高度的 HTML Fullscreen 缩小顶部栏与画布边距，隐藏次要 Esc 文案，保留明确退出入口。
- **回归**：新增 Focus 状态恢复、Read chrome、Fullscreen lifecycle、长文档滚动与窄窗口规则；本轮 Stage One **60 / 60**、HTML **12 / 12**、production build PASS。

本次 mode hardening 完成时，系统主题自动联动、最终视觉一致性与 bundle code-splitting 尚属于后续 UI / release 收尾；其中 bundle code-splitting 已在后续 2.11 Slice 完成。

## 2.9 Full HTML Editor — completed

2026-09-19 已完成 Full HTML Editor V1 Slice，继续保持 Note Format v1 的磁盘语义不变：

- **双路径编辑**：Quick Edit 继续作为快速修改 Current HTML 的轻路径；`Open Full Editor` 已接通真实高级编辑工作区，不再是 disabled placeholder。
- **Current / Original / Assets**：Full Editor 左侧 rail 明确区分 Current HTML、只读 Original HTML 与 Block-private `assets/**`；Original 仍受冻结不变量保护。
- **文本资源编辑**：CSS / JS / MJS / JSON / TXT 可读取、编辑与新建；binary assets 可列出并参与 preview，但 V1 不把它们当文本编辑。
- **本地 Draft 语义**：Full Editor 内 Current 与 asset 修改先只存在于 modal draft，不提前写入 Zustand live Note；Cancel 直接丢弃 Full Editor draft。
- **原子保存**：Save 将 Current HTML 与所有变更的文本 assets 一次提交到既有 Note atomic-save 管线；native save 成功后才 apply 新 snapshot。
- **失败保护**：native save 失败时 modal 保持打开、live Note 与磁盘 Current 均不变；非法 asset edit 不允许“Current 已写入、asset 失败”的半提交。
- **Live Preview**：右侧继续复用 sandbox + CSP 预览；未保存的文本 asset draft 会覆盖 preview resolver，因此 CSS / JS draft 可即时进入预览而不先落盘。
- **资源安全**：`note_list_assets` 只作用于已绑定且正文引用的 Block；asset edit 拒绝 traversal、绝对路径、反斜杠、冒号 / Windows ADS、NUL、跨 Block、binary edit、重复 target 与单文件超过 2 MiB。
- **重开验证**：Current HTML、既有 CSS 与新建 MJS 在真实磁盘保存后 close / reopen 保持一致，Original 保持导入时内容。
- **响应式 UI**：桌面三栏为 Assets rail + Source + Live Preview；窄窗口收敛为 rail + Source，不把 Markdown 本身变成 Block 编辑模型。

本 Slice 没有引入新的 `note.json` 字段、Block 目录或 `formatVersion`；asset delete / rename、binary asset 编辑、更完整资源 IDE 能力继续作为后续增强，不纳入 V1 Full Editor 完成条件。

## 2.10 Browser Bundle Export — completed

2026-09-19 已完成 Browser Bundle V1 Slice，并保持 Note Format v1 磁盘语义不变：

- **可直接浏览器打开**：Mixed Note 可导出为独立目录，根 `index.html` 可通过 `file://` 直接打开，不依赖 FlowNote 桌面运行时。
- **当前内容导出**：导出使用编辑器最新逻辑 Markdown 与各 HTML Block 的 Current HTML；Dirty 内容允许导出，但不会隐式保存或清除源 Note Dirty 状态。
- **资源完整性**：复制 Note-managed `assets/**` 与当前引用 Block 的私有 `blocks/<id>/assets/**`；不导出 `original.html`、`block.json` 或 orphan Block。
- **顺序与隔离**：HTML Block 按文档顺序进入根页面 iframe，继续使用 sandbox/CSP；默认网络保持禁用，经典 JS 仅按既有 `scriptPolicy` 语义执行。
- **源 Note 不变**：native 层基于绑定 capability/revision 与单次验证后的 NoteTree snapshot 物化导出；过期 revision、未来版本、非法 Block、危险路径、symlink/reparse parent 与已存在目标均拒绝发布。
- **原子发布**：先在 sibling staging directory 完整生成，再 rename 到最终目录；失败不留下成功目标，也不修改源 `.note`。
- **真实浏览器资格验证**：Chrome `file://` 下已验证根页面、Block iframe、managed CSS、classic JS 与图片资源均能正常工作且未放宽网络隔离。

Browser Bundle 已解决 Mixed Note 的主要可移植分享路径，并与后续 Mixed Markdown export 共用同一 native materializer。

## 2.11 Mixed Markdown Export & Bundle Splitting — completed

2026-09-19 已完成 Mixed Markdown Export V1 与第一轮前端 bundle 拆分：

- **明确降级语义**：Mixed Note 的 `flownote-html` Anchor 在导出 Markdown 中转换为普通相对链接 `[HTML Visual](./blocks/<id>/index.html)`，不再把 FlowNote 私有 Anchor 泄漏给普通 Markdown 消费者。
- **Current + Managed Resources**：导出当前 HTML，而不是 Original；同时复制 Note-managed `assets/**` 与当前引用 Block 的私有 `blocks/<id>/assets/**`，不留下指向源 `.note` 的内部路径。
- **普通 Markdown 行为不变**：普通 `.md` 仍使用原有直接 Markdown 下载路径；只有绑定的 Mixed Note 进入目录型 Markdown export。
- **Dirty 可导出**：允许导出当前未保存 Markdown / Current HTML，但不会隐式保存、覆盖源 Note 或清除 Dirty。
- **共享安全物化器**：Markdown export 与 Browser Bundle 共用 capability/revision 校验、NoteTree snapshot、路径检查、资源复制、staging + atomic rename 与失败清理，不维护第二套 ad-hoc copier。
- **真实浏览器资格验证**：Chrome `file://` 已验证导出的外部 Block 能加载复制后的 CSS、classic JS 与图片，且 CSP / 默认断网边界不放宽。
- **Bundle 拆分**：Vite 按 React、ProseMirror、Milkdown core/plugins 与 Tauri vendor 做稳定拆分；最大 chunk 从约 **861.20 kB** 降至 **256.18 kB**（gzip **79.53 kB**），原有 >500 kB 警告已消失。

本 Slice 不改变 Note Format v1；Shared Localized Resource、CDN Localization、cross-note managed dependency copy 与更广动态资源解析仍保留为后续需求。

## 2.12 V1 UI Polish — completed

2026-09-19 已完成 V1 最终 UI 收尾，继续保持 Document-first / continuous Markdown 编辑模型：

- **Auto / Light / Dark**：默认 Auto 跟随 `prefers-color-scheme`，系统主题实时变化时自动更新；用户显式选择 Light / Dark 后保持覆盖，并持久化到本地偏好。
- **参考稿视觉对齐**：重新对齐 `E:\flownote-desktop-ui-design` 的浅色 / 深色 app、sidebar、editor、border、text 与 accent token；没有为 Markdown 正文重新引入卡片、Block 框或 focus canvas 边框。
- **真实快捷键**：Topbar 的 `Ctrl/Cmd+K` 不再只是装饰提示；在非 Focus 且 Workspace 可搜索时会直接聚焦并选中搜索框。
- **诚实的 V1 Sidebar**：移除未实现的 Tags / Trash 假入口；这些能力仍由 Requirements Matrix 保留，不以静态占位伪装完成。
- **Quiet empty / error states**：无 Workspace、空 Workspace、无搜索结果、错误与成功提示使用更克制、可读、Light/Dark 一致的状态样式。
- **真实页面 QA**：启动实际 Vite 页面并生成 1440×960 的 Light / Dark Chrome 截图检查；临时截图与 browser profile 已清理，不进入仓库。
- **Release smoke**：Tauri release exe 启动后保持运行超过 4 秒，无启动即崩；随后由测试主动关闭。MSI 与 NSIS 均重新成功生成。

本 Slice 不新增存储语义，也没有把后续 Favorites / Trash / watcher / multi-Workspace / SQLite-FTS / tags / backlinks 等需求缩出产品定义。

## 2.13 Source Protection Narrowing — completed

2026-09-19 根据真实使用中的保护提示与编辑焦点体验继续收窄源码保护边界：

- **Frontmatter 不再强制源码模式**：YAML/TOML Frontmatter 从 Milkdown visual AST 中剥离为不可见 metadata envelope，BOM、换行、分隔符与 Frontmatter 原字节保持不变；可视化编辑只作用于正文，保存时重新拼接元数据包络。
- **自定义代码块语言不再误判危险语法**：任意 fenced code language（如 `systemverilog`、工具自定义 language tag）按普通 code block 往返；Prism 不认识的语言只是不高亮，不再因此禁止可视化编辑。带额外 code-fence meta 的代码块仍保留源码保护。
- **HTML 候选路径保留 Frontmatter**：插入 / Deep Copy HTML Block 时生成的候选 Markdown 会重新附加原 Frontmatter，避免转换或插入 Visual 时丢失元数据。
- **源码输入 focus 亮线移除**：源码 textarea 的 focus / focus-visible 不再绘制整块 accent outline；与可视化编辑一致，只通过 caret / selection 表达编辑焦点。
- **仍保留的保护**：WikiLink、Footnote、Mermaid、LaTeX、扩展 directive / attributes、code fence meta 及无效 HTML Anchor 等仍在不能证明安全往返时进入源码保护。

此变更不修改 Note Format v1，也不改变 Frontmatter 内容本身；FlowNote 只负责原字节保留与正文编辑，不尝试解释或重写元数据字段。

## 2.14 Reference UI Alignment — completed

2026-09-19 针对“真实 App 与最初桌面样例仍不够一致”的反馈，第二次逐组件对照 `E:\flownote-desktop-ui-design`，重点还原其桌面 shell、比例与排版，而不是重做产品交互：

- **Topbar 对齐**：改为参考稿的 FN 标识 + breadcrumb + 当前标题 / Mixed Note badge + Local 状态，中间保持紧凑 Edit / Read / Focus segmented control；右侧使用图标化 Search、真实 Export、Theme 与 Inspector。
- **搜索交互**：不再长期占用 Topbar 中央；`Ctrl/Cmd+K` 打开居中的搜索浮层，Sidebar 同时提供常驻搜索输入。
- **Sidebar 对齐**：宽度调整为 **256 px**，增加参考稿风格的 Search、New Note / Open / More、Files / Recent segmented tabs；真实 Workspace 文件树继续驱动内容，不恢复未实现的 Tags / Trash 假入口。
- **Inspector 对齐**：宽度调整为 **288 px**，增加带图标的 Outline / Block / Info segmented tabs 与关闭按钮；Outline / properties / empty state 的层级、边框和密度重新收敛。
- **编辑区排版**：保持约 820 px 的正文有效宽度，按参考稿对齐 15.5 px / 1.75 正文字号行高、H1/H2/H3、blockquote、inline code、列表间距与滚动条视觉。
- **无感编辑继续保持**：Markdown 仍是连续、直接可编辑文档；没有复制参考样例的 click-to-edit Block 模型。格式工具栏由“点击正文即出现”改为仅在文本选区或代码 / 表格上下文时出现。
- **Light / Dark 精确 token**：Topbar 采用参考值 Light `#fafbfc` / Dark `#13161c`，Sidebar 与 Editor 继续使用已对齐的参考 token。
- **视觉 QA**：使用相同 1440×960 真实 Chrome 截图与最初参考稿做像素级辅助比较；Topbar MAE 由 **11.77 → 9.35**，Sidebar 由 **8.71 → 7.63**（越低越接近）。Light Topbar 主背景已与参考稿一致为 `#fafbfc`；Dark 的 Topbar / Sidebar / Editor 主背景分别为 `#13161c` / `#151922` / `#191d26`。

本轮只调整 App Shell / 编辑展示与真实已有入口，不通过新增静态按钮伪装未实现能力，也不改变 Note Format v1 或连续 Markdown 的产品原则。

## 2.15 Raw HTML Visual Compatibility / Seamless Focus — completed

2026-09-19 根据真实 Markdown 文件继续修复“整篇被源码保护”和点击编辑区出现横线的问题：

- **Raw HTML 不再拖累整篇 Markdown**：Milkdown CommonMark 已把 raw HTML 解析为惰性 `html` atom，并以文本节点显示，不会把 `<script>` 等原文插成可执行 DOM；因此取消此前“一出现 HTML 原文就整篇源码保护”的过度保护。
- **仍保留语义门禁**：Raw HTML 只是取消 blanket reject，文档仍必须通过现有 AST semantic round-trip 检查；如果可视化往返会改变 Markdown 结构，仍会回到源码保护。
- **HTML 内部不误触扩展检测**：HTML atom 已纳入 literal masking，标签属性 / script block 内的 `$`、`[[` 等字面字符不会再被误认成 LaTeX / WikiLink；HTML 外真正的扩展语法仍按原规则保护。
- **Markdown 外围继续可视化**：含普通 Raw HTML 的文档现在仍可展示标题、强调、列表、引用、代码等标准 Markdown；资格样例 `08-roundtrip-stress.md` 已从整篇 source fallback 改为 visual edit，并覆盖保存 / 关闭 / 重开。
- **编辑区横线根因修复**：ProseMirror 默认 `.ProseMirror-gapcursor:after` 是 **20 px 水平 border-top**；现在改成正常的竖直 caret，不再在块间点击时显示横线。
- **源码区 focus 横线真正清除**：此前通用 `.writing-app textarea:focus-visible` 会覆盖 Source Editor 自己的 `outline: none`；本轮增加更高 specificity 的 Source Editor override，真实 Chrome computed style 已确认 outline style 为 `none`。
- **源码保护提示去分隔线**：`.editor-source-notice` 移除 full-width bottom border 和实色底，保护提示继续可见但不再形成编辑区上沿横线。
- **真实浏览器 QA**：在实际 Vite 页面中从 Source 输入“标题 + Markdown + Raw HTML + 列表”后切回 Visual，确认 `active=visual`、H1 / strong / 2 个列表项正常渲染、Raw HTML 作为惰性节点保留且 Source notice 消失；gap cursor pseudo-element computed style 为 `border-top: 0`、`border-left: 1px`。

本轮不执行任意 Markdown raw HTML；需要真实 HTML 运行 / 可视化的内容仍应使用 FlowNote 的隔离 HTML Block。WikiLink、Footnote、Mermaid、LaTeX、directive / attributes 等未接入完整 visual round-trip 的扩展语法继续安全地保留源码保护。

## 2.16 Link / Outline / Chrome Readability — completed

2026-09-22 修复三处直接影响日常使用的桌面交互问题：

- **Markdown 链接 Ctrl/Cmd+点击**：编辑器现在拦截外部 `http/https/mailto/tel` 链接的 Ctrl/Cmd+左键点击；Tauri 桌面端通过系统 Shell 打开，普通 Web QA 使用新标签页 fallback。普通单击仍留在编辑器中，不再把当前 FlowNote 页面直接导航走。
- **Shell capability**：主窗口显式加入 `shell:allow-open`，确保桌面 release 中链接可走系统默认浏览器/应用。
- **Outline 可点击**：右侧 Outline 从静态 `div` 改为可键盘聚焦的真实 `button`；点击后通过编辑器 `revealHeading(index)` 定位对应 H1–H3、滚动到视野中并在编辑模式下恢复正文焦点。
- **非编辑区字号提升**：只增大 Topbar、Sidebar、文件树、搜索、Inspector、状态区等系统 chrome；正文保持原来的 **15.5 px**，没有放大 Markdown 写作区。主要 UI 字号由原先大量 **9–11.5 px** 提升到约 **11.5–14 px**。
- **真实 Chrome QA**：1440×960 页面实测正文仍为 15.5 px，品牌 14 px、breadcrumb 12.5 px、Outline 12.5 px；Outline 共有 6 个可点击 BUTTON，点击第二项后焦点回到 ProseMirror。
- **回归**：新增链接打开与 Outline 定位测试；Stage One 更新为 **67 / 67**。Format Freeze、Desktop UI / IPC、production build、Tauri MSI / NSIS build 与 release exe smoke 均 PASS。

## 2.17 V1.1 Visual Library Slice 1 — completed

2026-09-22 已完成 V1.1 第一切片，把此前只存在于单个 Note 内的 HTML Visual 提升为可复用的本地 Visual Library，同时保持 Note Format v1 不变：

- **收藏边界**：HTML Visual 工具条新增 Collect；只允许从已保存、revision 一致的可写 Mixed Note 收藏，避免把未提交 draft 或外部冲突状态误当作稳定库条目。
- **独立 Library Store**：Visual Library 存放在 FlowNote app-data，而不是 `.note` 内部；每项使用独立 UUID 目录，保存 `visual.json`、Current `index.html`、`original.html`、`block.json` 与 `assets/**`，因此不成为 Note 正文 / 顺序的第二事实来源。
- **完整 Visual Package**：收藏时保留 Current HTML、Original HTML、Block config 与 Block-private managed assets；源 Note 不被修改。
- **Sidebar 浏览**：Files / Recent 旁新增 Visuals Tab；Library card 使用既有 sandbox + CSP 预览，并通过 library-scoped resource reader 解析 CSS / JS / image 等 managed assets。
- **独立插入**：Insert 会生成全新 Block UUID，使用编辑器当前选区生成新的 `flownote-html` Anchor，并把 Library-owned assets 作为一次 Note atomic-save transaction 导入到新 Block。
- **Ownership 隔离**：插入后的 Block、原始源 Block 与 Library item 三者资源互不共享；修改目标副本不会反向污染 Library 或来源 Note。
- **路径 / capability 安全**：Library item ID、asset relative path、symlink/reparse 与文件大小 / 数量均有边界校验；Visual Library 原生命令仍仅允许主窗口调用。
- **真实磁盘验证**：新增 end-to-end 测试覆盖 Collect → Library 落盘 → Sidebar browse → Insert → close/reopen，并验证 Current / Original / CSS / binary image 均独立复制。
- **格式不变量**：没有新增 `note.json` / `block.json` 磁盘字段，也没有提高 `formatVersion`；Library metadata 是 app-owned schema，与冻结的 Note Format v1 解耦。

本 Slice 明确未包含 Library rename/delete/favorite/tags/search；这些进入 V1.1 后续 metadata-management Slice，不通过修改 Note 内容实现。

## 2.18 V1.1 Visual Library Slice 2 — metadata management completed

2026-09-22 在 Slice 1 的 reusable Visual package 基础上完成 Library metadata 与恢复能力，仍保持 Note Format v1 冻结：

- **Rename / Tags / Favorite**：Visual card 可直接编辑标题与 tags，并可切换 Favorite；metadata 更新只写 app-owned `visual.json`。
- **Search / Filter**：Visuals Sidebar 支持按 title / tags 即时搜索，并提供 All / Favorites / Trash 过滤；不扫描 Note 正文，也不引入 SQLite/FTS。
- **Recoverable Trash**：删除操作不递归销毁 package，而是把整个 Visual 目录从 `items/` 原子移动到 `trash/`；Trash 中可预览、读取资源并 Restore，但不能 Insert。
- **Ownership 不联动**：Trash / Restore 不修改来源 Note，也不删除已插入其他 Note 的独立 Block 副本。
- **向后兼容**：Slice 1 旧 `visual.json` 没有 `favorite` / `tags` 字段时通过默认值读取，无需迁移或修改 Note Format。
- **metadata recovery**：metadata replacement 使用 candidate + backup；如果上次更新在 `visual.json → backup` 后中断，下一次更新会先恢复 backup，再继续提交。
- **并发边界**：Tauri 端新增 Visual Library mutex，list / collect / package / asset / update / trash / restore 在同一 Library 状态边界内串行化。
- **验证覆盖**：新增 native legacy metadata / Trash / Restore / backup recovery、前端 rename / tags / favorite / search / filter、真实磁盘 metadata + Trash + Restore + Insert 隔离测试。

VLIB-06 已完成；Library metadata 仍与 `.note` 的 `note.json` / `block.json` 解耦。

## 2.19 V1.1 Visual Library Slice 3 — explicit Make Local completed

2026-09-22 已完成 reusable Visual 的第一阶段 Local First 资源本地化，继续保持 Note Format v1 的 `formatVersion: 1`：

- **显式 Make Local**：Remote dependency 可以被只读识别，但只有用户主动点击 **Make Local** 才会发起网络下载；Collect、Library 浏览、普通 Preview、Insert 与 Note reopen 都不会隐式获取网络权限。
- **静态依赖范围**：当前支持 classic `script[src]`、stylesheet `link[href]`、`img[src]`、inline CSS `url()`，以及 localized stylesheet 内按原 stylesheet URL 解析的嵌套 `url()`。module script、`@import`、动态 `fetch()`、Worker / WASM 等会保留为 unresolved，不伪装为已本地化。
- **映射而非改写源码**：remote → local 映射持久化在 `block.json.resources.localized`；Make Local 不为了替换 CDN URL 而重写 Current `index.html` 或 Original `original.html`。Runtime Resolver 只在预览 / 导出候选中物化 data URL。
- **Library-owned transaction**：下载内容先写入 staged Visual package，全部资源验证完成后再原子替换 Library item；任一必需资源失败时旧 item 保持不变。localized payload 存在 Library item 自有 `assets/localized/**`。
- **下载安全边界**：第一阶段 HTTPS only；URL 不允许嵌入凭据；localhost、loopback、private、link-local、multicast / unspecified 等非公网地址拒绝；DNS 解析后固定已验证公网地址，redirect 每跳重新验证；同时限制 redirect、单资源大小、总大小、资源数与 MIME。
- **Remote / Partially Local / Local 状态**：Visual card 显示紧凑资源状态；只有仍存在可支持且未本地化的静态依赖时显示 Make Local；Trash item 不提供本地化操作。
- **独立 Insert ownership**：localized Library item 插入 Mixed Note 时，继续生成新 Block UUID，并把 mapping 与全部 localized private assets 复制到目标 Block。Library、来源 Note、目标 Note 不共享可变文件所有权。
- **真实磁盘验证**：端到端覆盖 Make Local → Library mapping / payload 落盘 → Current / Original 与来源 Note 原字节不变 → Insert 深复制 → 修改目标 localized payload 不影响 Library / 来源 Note → close/reopen → iframe 从目标 Block 自有资源离线解析。
- **运行时路径补齐**：Note 内 HtmlBlockView、Full HTML Editor、Visual Library Preview 与 Browser Bundle resolver 均会读取 Block config 的 localized mappings，避免只在 Library card 中能离线预览而 Note reopen 失效。
- **明确未完成**：Note-shared `assets/shared/**`、跨 Block / 跨 Note immutable dedup、完整 `@import`、module graph、dynamic fetch、Worker / WASM resolver，以及 session-only “Allow network for this preview” 仍保留为 V1.5 / V2 需求。

## 2.20 V1.1 Editing Usability / Workspace Trash — completed

2026-09-26 针对真实使用反馈完成一轮编辑体验与桌面交互修复，不改变 Document-first / Local-first 架构：

- **LaTeX**：标准 `$...$` / `$$...$$` 不再把整篇文档踢进源码保护，启用现有 Milkdown math 插件；反斜杠定界公式仍保留源码保护。
- **空白画布光标**：点击 Markdown 正文下方 / 周围的编辑空白会聚焦 ProseMirror，并按坐标定位，无法映射坐标时落到文末。
- **HTML / Visual 入口**：独立 HTML plain-text 粘贴继续走 sandboxed HTML Visual / Mixed Note 管线；主入口使用 `Add Visual`，不要求用户先理解内部 Block / `.note` 术语。
- **Workspace 文件操作**：folder 提供 `New Note Here` / Rename / Move to Trash，Markdown / `.note` 提供 Rename / Move to Trash；Trash 使用隐藏 `.flownote-trash`，支持原路径 Restore 与二次确认 Permanent Delete。
- **Dirty / IME 安全**：当前文档移到 Trash 仍复用既有未保存更改决策；取消后不会移动文件。IME composition 下关闭请求也保持可恢复决策路径。

## 3. 最新验证基线

2026-09-26 Make Local + Workspace Trash / Add Visual / LaTeX 集成后的 fresh verification：

| 验证项 | 结果 |
|---|---:|
| Workspace Frontend | **9 / 9** |
| Workspace Native | **14 / 14** |
| Format Freeze Gate | **PASS** |
| HTML | **20 / 20** |
| Stage One | **72 / 72** |
| Protection | **44 / 44** |
| Qualification | **36 / 36** |
| Files | **19 / 19** |
| 真实磁盘 | **20 / 20** |
| Browser Bundle `file://` qualification | **PASS** |
| Markdown Export `file://` qualification | **PASS** |
| Desktop UI | **12 / 12** |
| Desktop IPC / Rust desktop commands | **12 / 12** |
| Rust 全套 | **106 passed / 1 ignored** |
| Rust Clippy | **PASS** |
| Frontend build | **PASS** |
| Tauri release build | 最近 release checkpoint PASS；本轮未重打包 |
| Release exe smoke | 最近 release checkpoint PASS；本轮未重跑 |

本轮前端 production build **PASS**。当前最大 JS chunk 为 **475.44 kB**（gzip **147.54 kB**），仍低于 Vite 500 kB warning 阈值；此前约 861 kB 的单主 bundle 已拆分。Tauri release build / exe smoke 沿用最近一次 release checkpoint，本轮未重新打安装包。Rust 全套中的 1 个 ignored 是由 editor-to-disk 集成测试通过 stdin 驱动的 file-driver harness，不是失败项。测试环境仍会输出既有 Prism Tcl language 与部分 React `act()` warning，但本轮相关断言均 PASS。

## 4. 当前基线文档

| 职责 | 文档 |
|---|---|
| 产品范围与 V1 验收 | [PRD v0.3](<../FlowNote PRD v0.3 — V1 Baseline.md>) |
| 最终需求与覆盖状态 | [Requirements Matrix](../REQUIREMENTS-MATRIX.md) |
| 持久化格式 | [Note Format v1.2 / Final](<../FlowNote Note Format v1.2 — Freeze Candidate Draft.md>) |
| 资源运行时架构 | [Resource Architecture](../docs/superpowers/specs/2026-09-15-resource-architecture-design.md) |
| 当前验收清单 | [CHECKLIST.md](./CHECKLIST.md) |
| 开发顺序与参考 | [Open Source Development Guide v0.1](<../FlowNote Open Source Development Guide v0.1.md>) |

格式文档当前为 **v1.2 Final**；磁盘字段仍为 `formatVersion: 1`。本次冻结没有改变磁盘版本号；未来不兼容格式变更必须显式升级 `formatVersion`。

## 5. 下一阶段：shared localization / release hardening

V1.1 reusable Visual 的 Collect、metadata management 与显式 Make Local 已形成完整的第一阶段 Local First 闭环。下一步不再重复实现 private localization，而是沿既有 Resource Architecture 往共享与发布边界推进：

1. **Note-shared immutable resources**：实现 `assets/shared/<resource-id>/**` 与明确 ownership / reference model，避免多个 Block 对同一不可变 CDN payload 做无意义重复复制。
2. **Cross-note managed dependency copy**：在不产生隐藏跨 Note 文件依赖的前提下，复制 / 导入所需 shared dependencies。
3. **Resolver 扩展**：评估 `@import`、ES module graph、dynamic `fetch()`、Worker / WASM 的可证明安全解析；当前 unresolved 项继续显式保留。
4. **Session-only network permission**：如果加入 “Allow this preview session”，权限必须只存在运行时，并在 close / restart / source change / preview recreation 后失效。
5. **Release hardening**：继续真实 MSI / NSIS 安装、卸载、升级路径验证，并用现有 GitHub Release tag pipeline 发布后续版本。

后续共享资源能力仍不得通过修改冻结的 Note Format v1 基础语义或把网络权限持久化到 Note 中来实现。
