# FlowNote 开发验收清单

**当前阶段：Slice 1 / 2 / 3、V1 Workspace 与 Note Format v1 Format Freeze 均 completed；当前进入 `V1 产品收尾`。**

**状态值：pending / in_progress / completed**

以 [STATUS.md](./STATUS.md) 为当前状态入口，以 [Requirements Matrix](../REQUIREMENTS-MATRIX.md) 保留最终需求边界。Slice 完成只表示当前实现范围完成，不能通过删项把后续需求“做没”。

## Markdown / 文件基础能力 — completed

- [x] 可视化 / 源码双模式，复杂列表、任务列表、表格、代码、图片、粘贴、撤销 / 重做。
- [x] Frontmatter、WikiLink、脚注、raw HTML、Mermaid、LaTeX 等风险语法进入保真路径，不静默丢失。
- [x] Windows 普通 `.md` 新建、打开、保存、另存为、重载、关闭 / 重开。
- [x] Dirty / 外部版本检查、保存失败恢复、迟到回执保护、关闭 / 切换生命周期保护。
- [x] 用户已完成真实输入法、原生文件选择器和界面操作验证；Markdown Gate 已通过。
- [x] Mermaid / LaTeX 源码保留；渲染增强仍属于后续候选。

## Slice 1 — completed

- [x] Markdown + HTML → `.note` 持久化 → Close → Reopen。
- [x] 显式 HTML 导入；raw HTML 不自动升级为可执行 HTML Block。
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
- [ ] CDN Localization 与 remote → local shared mapping。
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
- [ ] Full HTML Editor（Quick Edit 已完成，复杂 CSS / JS / resource workflow 仍待实现）。

## V1 Workspace Slice — completed

- [x] 单一真实本地 Workspace：Choose / Change / Restart Restore。
- [x] `.md` / `.markdown` / `.note` 真实树；`.note` 作为 package 叶节点，不展开内部资源。
- [x] Workspace path capability：仅 relative path，拒绝 traversal / absolute / backslash / colon / NUL / symlink escape。
- [x] New Note：当前 folder 下 collision-free `Untitled.md`；首次点击可完成 Choose Workspace → Create → Open。
- [x] Rename：folder / Markdown / Note package；后缀保留、冲突拒绝；folder rename 迁移 active / expanded / selected folder / Recent 子路径。
- [x] Recent：按 Workspace ID 记录相对路径，去重、限 10 条、Missing / Refresh 清理，不复制正文。
- [x] 基础 Search：filename / H1 / Markdown body / Note metadata title / `.note/content.md`；跳过超大文本与 Block private assets，结果上限 100。
- [x] Search race：旧查询结果不能覆盖更新查询。
- [x] Markdown ↔ Mixed Note Workspace 切换复用既有 Dirty / IME / pending-save 保护。
- [x] 候选/旧 capability 在 cancel / failure / successful switch 时按正确顺序释放。
- [x] Sidebar 使用真实 Workspace 数据，无静态 Research / PD / Cislunar 假目录；row action 按 hover/focus 渐进显示。
- [x] 手动 Refresh + create / rename / restore / change 后 rescan。
- [ ] Favorites 持久化。
- [ ] Trash / delete / recovery。
- [ ] filesystem watcher。
- [ ] multi-Workspace。
- [ ] SQLite / FTS 索引搜索。

## 最新验证 — completed

- [x] Workspace Frontend：**8 / 8**
- [x] Workspace Native：**11 / 11**
- [x] Format Freeze Gate：PASS
- [x] HTML：**12 / 12**
- [x] Stage One：**60 / 60**
- [x] Protection：**38 / 38**
- [x] Qualification：**36 / 36**
- [x] Files：**18 / 18**
- [x] 真实磁盘：**16 / 16**
- [x] Desktop UI：**12 / 12**
- [x] Desktop IPC / Rust desktop commands：**12 / 12**
- [x] Rust 全套：**85 passed / 1 ignored**
- [x] Rust Clippy：PASS
- [x] Frontend build：PASS
- [x] Tauri release build：PASS
- [x] 2026-09-19 production build 主 JS 约 **843.35 kB**（gzip **265.93 kB**）；>500 kB code-splitting warning 继续列入 V1 收尾。
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
- [ ] Full HTML Editor：补复杂 HTML / CSS / JS 与资源管理路径。
- [ ] Browser Bundle export：Mixed Note 可脱离 FlowNote 打开，保持正文 / 图片 / Block 顺序与隔离语义。
- [ ] Markdown export：明确 Mixed Note 导出策略，不能静默丢失 HTML 或 managed resources。
- [ ] 收尾 UI / 系统主题联动 / 错误提示 / 空状态 / bundle 体积 / 最终发布验证。

## 需求保留规则

- [x] Slice 状态与最终需求分离：Slice 的 `completed` 不代表 Requirements Matrix 对应所有 Planned / Partial 项都完成。
- [x] Shared Localized Resource、CDN Localization、cross-note managed dependency copy 等继续保留。
- [ ] 任何需求若确实决定取消，必须显式修改 PRD + Requirements Matrix，并记录原因；不得通过状态文档静默删除。
