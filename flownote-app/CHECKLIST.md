# FlowNote 开发验收清单

**当前阶段：Slice 1 / 2 / 3、V1 Workspace 与 Note Format v1 Format Freeze 均 completed；当前进入 `V1 产品收尾`。**

**状态值：pending / in_progress / completed**

以 [STATUS.md](./STATUS.md) 为当前状态入口，以 [Requirements Matrix](../REQUIREMENTS-MATRIX.md) 保留最终需求边界。Slice 完成只表示当前实现范围完成，不能通过删项把后续需求“做没”。

## Markdown / 文件基础能力 — completed

- [x] 可视化 / 源码双模式，复杂列表、任务列表、表格、代码、图片、粘贴、撤销 / 重做。
- [x] Frontmatter、WikiLink、脚注、raw HTML、Mermaid 与反斜杠定界 LaTeX 等风险语法进入保真路径；标准 `$...$` / `$$...$$` LaTeX 已支持可视化编辑，不静默丢失。
- [x] Windows 普通 `.md` 新建、打开、保存、另存为、重载、关闭 / 重开。
- [x] Dirty / 外部版本检查、保存失败恢复、迟到回执保护、关闭 / 切换生命周期保护。
- [x] 用户已完成真实输入法、原生文件选择器和界面操作验证；Markdown Gate 已通过。
- [x] 标准 `$...$` / `$$...$$` LaTeX 使用 Milkdown math 可视化编辑；`\\(...\\)` / `\\[...\\]` 与 Mermaid 继续源码保护。

## Slice 1 — completed

- [x] Markdown + HTML → `.note` 持久化 → Close → Reopen。
- [x] HTML 导入：现有 Markdown 中的 raw HTML 仍保持惰性；用户粘贴独立 HTML 源码时显式路由到 sandboxed HTML Visual / Mixed Note 导入。
- [x] `content.md` 作为正文 / 顺序唯一事实来源，`note.json` 不重复正文。
- [x] HTML Block Current / Original 分离，普通保存不覆盖 Original。
- [x] HTML NodeView 已注册，在 Markdown 原位置渲染隔离 iframe。
- [x] Script policy 与 network policy 分离；默认 sandbox + CSP 阻止联网。
- [x] Ctrl+S、Dirty 关闭保护、真实 App → Rust → 磁盘关闭重开验证完成。

## Slice 2 — completed

- [x] `.md → .note` 显式转换保留原 `.md`。
- [x] Markdown managed images 复制到 `.note/assets/images/` 并只重写真实 image node。
- [x] HTML Block 私有 `blocks/<id>/assets/**` 资源接入 capability-bound reader。
- [x] CSS / JS / Image 与 CSS `url()` 当前运行时解析完成。
- [x] 第二 HTML Block、多个 Block 的 Current / Original / private assets 独立。
- [x] 保存失败 rollback，candidate → save → success apply 语义通过。
- [x] 整个 `.note` 移动到新父目录后可重新打开，managed references 保持可用。
- [x] Host 绝对路径不暴露给 iframe；persisted Source 保持相对路径。

## Slice 3 — completed（当前实现范围）

- [x] **Clean 自动 reload**：无本地修改时检测到外部变化可自动 / 轻提示重载。
- [x] **Dirty conflict**：本地 Dirty + 磁盘变化进入显式冲突，不做 last-write-wins。
- [x] **IME queue**：composition 期间外部变化先排队，composition 结束后重新检查版本再应用。
- [x] **Missing repair**：缺失 Block / 资源条件可诊断并进入显式修复，不静默删除正文。
- [x] **Orphan repair**：Orphan Block 不自动删除，可进入显式 repair / recovery 路径。
- [x] **same-note Deep Copy**：HTML Block Deep Copy 生成新 Block ID，并复制 Block-private assets。
- [x] **shared read-only probe / resource snapshot**：共享 / 外部资源按只读探测与快照处理，避免错误写回。
- [x] **disposal guard**：关闭、切换、capability 释放及异步回执期间，旧会话结果不能重新污染当前文档。

### Slice 3 明确未包含

- [ ] **cross-note managed dependency copy**：跨 Note 复制时携带完整 managed shared dependencies，仍是后续需求。
- [ ] Shared Localized Resource（`assets/shared/**`）完整产品路径。
- [ ] Note-shared CDN Localization 与 remote → `assets/shared/**` mapping；V1.1 Visual Library / Block-private Make Local 已完成。
- [ ] `@import`、动态 `fetch()`、module import、Worker / WASM 等更广资源 resolver 支持。
- [ ] 完整 FlowNote Trash / 删除资源恢复 UX。

上述未完成项继续由 [REQUIREMENTS-MATRIX.md](../REQUIREMENTS-MATRIX.md) 保留，不能因为 Slice 3 completed 而删除。

## V1 UI 第一波 App 原型 — completed

- [x] App Shell：极简 Topbar + 可折叠 Files Sidebar + 中央 Document + 按需 Inspector。
- [x] Markdown 保持连续可直接编辑，不引入 click-to-edit Markdown Block。
- [x] Edit / Read / Focus：Read 只读去噪；Focus 隐藏左右栏但继续可编辑。
- [x] New Note / Open 保持左栏高频入口，其余文件与 Mixed 操作进入 File actions。
- [x] Inspector：Outline / Block / Info 第一波上下文视图。
- [x] HTML Visual：Normal / Hover / Selected 控件渐进披露，支持第一波 Normal / Wide / Full 展示交互。
- [x] HTML Quick Edit：HTML Source + Live Preview 大弹窗；现有 Current / Original 语义保持不变。
- [x] HTML Fullscreen：独立展示层，支持 Esc / Close 退出。
- [x] Light / Dark 基础主题切换。
- [x] 真实 Workspace 文件树与基础搜索：本地目录绑定/恢复、`.md/.note` 树、Recent、New Note、rename、标题/正文直接扫描搜索已接入。当前搜索为 bounded native scan，不是 SQLite/FTS 索引。
- [x] Full HTML Editor：Current / Original / Assets 三路、CSS/JS/MJS/JSON/TXT 编辑与新建、binary read-only、sandbox live preview、Cancel/failed Save 不污染 live Note、Current + asset 原子保存。

## V1 Workspace Slice — completed

- [x] 单一真实本地 Workspace：Choose / Change / Restart Restore。
- [x] `.md` / `.markdown` / `.note` 真实树；`.note` 作为 package 叶节点，不展开内部资源。
- [x] Workspace path capability：仅 relative path，拒绝 traversal / absolute / backslash / colon / NUL / symlink escape。
- [x] New Note：当前 folder 下 collision-free `Untitled.md`；首次点击可完成 Choose Workspace → Create → Open；folder 行菜单支持 `New Note Here`，无需先切换选中目录。
- [x] Rename：folder / Markdown / Note package；后缀保留、冲突拒绝；folder rename 迁移 active / expanded / selected folder / Recent 子路径。
- [x] Recent：按 Workspace ID 记录相对路径，去重、限 10 条、Missing / Refresh 清理，不复制正文。
- [x] 基础 Search：filename / H1 / Markdown body / Note metadata title / `.note/content.md`；跳过超大文本与 Block private assets，结果上限 100。
- [x] Search race：旧查询结果不能覆盖更新查询。
- [x] Markdown ↔ Mixed Note Workspace 切换复用既有 Dirty / IME / pending-save 保护。
- [x] 候选/旧 capability 在 cancel / failure / successful switch 时按正确顺序释放。
- [x] Sidebar 使用真实 Workspace 数据，无静态 Research / PD / Cislunar 假目录；row action 按 hover/focus 渐进显示。
- [x] 手动 Refresh + create / rename / trash / restore / permanent-delete / change 后 rescan。
- [ ] Favorites 持久化。
- [x] Workspace Trash：三点菜单 / 右键统一使用 Move to Trash；Markdown、`.note` 与非空 folder 均原子移动到隐藏 `.flownote-trash/<id>/payload`，正常文件树与 Search 不扫描 Trash。
- [x] Workspace Trash recovery：Trash 视图支持按原相对路径 Restore；同名冲突或原父目录缺失时明确失败且保留 payload；Permanent Delete 仅在 Trash 内二次确认后执行。
- [ ] Trash 批量清空 / 自定义恢复位置 / 自动清理策略。
- [ ] filesystem watcher。
- [ ] multi-Workspace。
- [ ] SQLite / FTS 索引搜索。

## 最新验证 — completed

- [x] 2026-09-26 Make Local + Workspace Trash 集成后的 fresh verification：Workspace Frontend **9/9**、Workspace Native **14/14**、Format Freeze **PASS**、HTML **20/20**、Stage One **72/72**、Protection **44/44**、Qualification **36/36**、Files **19/19**、真实磁盘 **20/20**、Desktop UI / Rust IPC **12/12**、Rust 全套 **106 passed / 1 ignored**、Clippy **PASS**、Frontend build **PASS**。
- [x] Tauri release build：最近 release checkpoint PASS；本轮集成尚未重打包。
## Format Freeze — completed

- [x] 冻结 `formatVersion: 1` 当前持久化语义；Note Format v1.2 已升级为 Final。
- [x] 未知 future `formatVersion` 只读打开，不自动 rewrite / downgrade，且 save / save-as 被拒绝。
- [x] Missing / duplicate / orphan / temp / partial Block 条件均有稳定可恢复行为，不自动删除异常数据。
- [x] 外部修改三态在 `.md` 与 `.note` 关键路径完成冻结验证；IME 期间延迟处理。
- [x] Deep Copy、保存失败 recovery package、Note 移动后重开进入冻结测试集。
- [x] 新增 `npm run test:format-freeze` 作为可重复 Freeze Gate。
- [x] 修复 external snapshot hydration 的 Markdown 规范化回声误标 Dirty 竞态；最小回归 RED→GREEN，真实磁盘 Deep Copy 场景连续 10 / 10 通过。
- [x] Crash / Failure：partial Block、遗留 `.flownote-*.tmp` 与 atomic-save recovery 都保留可恢复数据。
## V1 产品收尾 — pending

- [x] Read / Focus / Fullscreen 硬化：Read 去编辑 chrome；Focus 隐藏并恢复左右栏状态；HTML Fullscreen 管理焦点、背景 inert、滚动锁定与 Esc 恢复；长文档 / 窄窗口回归已覆盖。
- [x] 文件树：当前 Sidebar 已接入真实 Workspace 文件组织与持久化恢复。
- [x] 搜索：已接入 filename / title / Markdown body / `.note/content.md` 的基础 native bounded scan；SQLite/FTS 索引属于后续增强。
- [x] Full HTML Editor：Quick Edit 入口已接通；Full Editor draft 本地隔离，Current + Block 私有文本资源一次原子保存；Original 只读，binary 只读；失败保存与非法资源编辑均不污染 live Note / 磁盘。
- [x] Browser Bundle export：Mixed Note 可导出为普通浏览器可直接打开的目录；保留当前 Markdown、managed images、HTML Block 顺序、Current HTML 与 Block 私有资源，默认断网且不修改源 `.note`。
- [x] Markdown export：Mixed Note 的 HTML Anchor 转为外部 HTML 相对链接；Current HTML、Note-managed assets 与 Block-private assets 一并导出，Dirty 可导出且不隐式保存源 `.note`。
- [x] Bundle code-splitting：按 React / ProseMirror / Milkdown / Tauri vendor 拆分；当前 production build 最大 JS chunk 为 475.44 kB（gzip 147.54 kB），仍低于 Vite 500 kB warning 阈值。
- [x] V1 UI Polish：Auto / Light / Dark 系统主题联动与偏好持久化、参考稿 token 对齐、Ctrl/Cmd+K 搜索、Quiet empty/error states；当时的 Tags / Trash 假入口已移除，当前 Workspace Trash 已由真实能力重新接入；连续 Markdown 编辑面保持无 Block 框。
- [x] Source Protection Narrowing：Frontmatter 原字节包络 + 可视化正文、任意 fenced code language 普通往返、HTML 候选保留 Frontmatter；源码输入 focus accent 横线已移除。
- [x] Reference UI Alignment：二次逐组件对照 `E:\flownote-desktop-ui-design`，完成 256 px Sidebar、288 px Inspector、参考 Topbar / breadcrumb / tabs / typography / scrollbar、selection-only 工具栏；不引入 Markdown Block 编辑模型或未实现假入口。
- [x] Raw HTML Visual Compatibility / Seamless Focus：Raw HTML 通过 semantic round-trip 后作为惰性 atom 保留，外围 Markdown 继续可视化；08-roundtrip-stress 已覆盖 visual save/reopen；ProseMirror 水平 gap cursor 改为竖直 caret，Source notice / textarea focus 横线已移除。
- [x] Link / Outline / Chrome Readability：Markdown 外部链接支持 Ctrl/Cmd+点击系统打开；右侧 Outline 可点击跳转 H1–H3；Topbar / Sidebar / 文件树 / Inspector / 状态区字号提升且正文 15.5 px 保持不变。
- [x] V1.1 Visual Library Slice 1：HTML Visual 可收藏 Current / Original / config / private assets，在 Visuals Sidebar 预览，并以新 Block ID + 独立资源插入 Mixed Note。
- [x] V1.1 Visual Library Slice 2：rename / tags / favorite / title+tag search / Favorites / recoverable Trash+Restore；metadata 属于 app-owned Library，不修改 Note Format v1。
- [x] V1.1 Visual Library Slice 3：Remote / Partially Local / Local 检测与显式 Make Local；静态 HTTPS CSS / JS / image / CSS `url()` 事务式本地化到 Library-owned `assets/localized/**`，以 `block.json.resources.localized` 做映射而不改写 Current / Original；Insert 深复制 mapping + localized assets 到新 Block，来源 Note / Library / 目标 Note ownership 独立。
- [x] Workspace Trash / Direct Actions：真实 Files 增加 `New Note Here`、Move to Trash、Restore / Permanent Delete；HTML 主入口改为 `Add Visual` + 直接粘贴 HTML 提示，底层继续复用既有 sandboxed Mixed Note 流程。
- [x] v0.1.2 Release build / exe smoke：production build、MSI、NSIS 均 fresh PASS；release exe 版本为 0.1.2 且启动后稳定运行。
- [x] v0.1.2 安装级验证：官方 v0.1.1 NSIS clean install → v0.1.2 NSIS upgrade → 启动 → silent uninstall PASS；v0.1.2 MSI per-user install → 启动 → uninstall PASS；两种卸载后注册表 / install dir / process 均清理。
- [x] v0.1.2 GitHub Release：tag `v0.1.2` 已发布；Actions run `36221114643` success；远端 NSIS / MSI / `SHA256SUMS.txt` 三个资产均已上传并通过实际下载哈希核对，CI 产物也已完成安装 / 启动 / 卸载 smoke。

## 需求保留规则

- [x] Slice 状态与最终需求分离：Slice 的 `completed` 不代表 Requirements Matrix 对应所有 Planned / Partial 项都完成。
- [x] Note-shared Localized Resource、shared CDN dedup、cross-note managed dependency copy、`@import` / module / dynamic fetch / Worker / WASM 等继续保留；已完成的 Library / Block-private Make Local 不等于 shared localization 完成。
- [ ] 任何需求若确实决定取消，必须显式修改 PRD + Requirements Matrix，并记录原因；不得通过状态文档静默删除。
