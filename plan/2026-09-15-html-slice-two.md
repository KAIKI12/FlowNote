---
mode: completed-plan
cwd: E:/FlowNote
task: HTML Block / .note Vertical Slice 2
created_at: 2026-09-15T18:30:00+08:00
revised_at: 2026-09-15T20:55:00+08:00
status: completed-2026-09-15
---

# HTML Block Slice 2 — Implementation Coverage Plan

本文件只定义 **Slice 2 当前实现覆盖率**，不定义或缩减 FlowNote 最终资源需求。

最终需求来源：

- [PRD v0.3](<../FlowNote PRD v0.3 — V1 Baseline.md>)
- [Requirements Matrix](../REQUIREMENTS-MATRIX.md)
- [Note Format v1.2](<../FlowNote Note Format v1.2 — Freeze Candidate Draft.md>)
- [Resource Architecture Design](../docs/superpowers/specs/2026-09-15-resource-architecture-design.md)

## 目标

在 Slice 1 的可靠 Mixed Note 基础上，推进以下 requirement IDs：

```text
HTML-02
RES-01 / RES-03 / RES-04 / RES-05 / RES-06 / RES-07 / RES-08 / RES-13 / RES-14
MIG-02 / MIG-03 / MIG-04
REL-03
```

Slice 2 验证：

1. 同一 Note 可以可靠持久化至少两个独立 HTML Block。
2. HTML Block 可以通过最终 Resource Resolver 边界安全读取自己的 private managed resources。
3. 私有资源至少覆盖当前验收所需的 CSS / JS / Image；实现接口不能把最终架构锁死为这三种类型。
4. 整个 `.note` 移动后 managed relative resources 仍可解析。
5. `.md → .note` 时，FlowNote 能识别的 Markdown managed images 采用 Copy → Rewrite Candidate → Validate → Commit；原 `.md` 和旧资源保留。

## 与最终架构的关系

Slice 2 不实现下列 Requirement，并不表示取消：

```text
RES-09  Note-shared localized resources
RES-10  explicit shared dependency mapping
RES-11  CDN localization
RES-15  CSS nested resolver complete coverage
RES-16  dynamic fetch/module/Worker/WASM complete coverage
COPY-01..05
AI-02
EXP-05
```

这些 requirement 必须继续留在 `REQUIREMENTS-MATRIX.md`。

## Runtime 实现约束

1. 后端资源访问必须基于 Note capability + Block ID + managed relative path，而不是 Host absolute path。
2. Resource Resolver 是长期接口边界。当前实现可以选择 data/blob/custom-protocol 等 materialization 技术，但 iframe 不得知道真实主机路径，且 Runtime URL 不得落盘。
3. 资源路径必须拒绝 `..`、绝对路径、反斜杠绕过、symlink escape、跨 Block private read、未知 capability。
4. 默认 Network Off 继续由 runtime/CSP 强制。
5. 当前 Slice 即使只测试静态 CSS / JS / Image，也要以通用 ResourceRequest / ResourceResponse 方式实现，不把 tag-specific replacement 当作最终数据模型。

## 第二 HTML Block

已有 Mixed Note 中显式“导入 HTML”应创建新 Block：

```text
Current Note
↓
create new Block ID + Current + Original + block.json candidate
↓
preview candidate Anchor at current editor position
↓
save Note candidate
↓ success
apply editor candidate
```

失败时：

- 不留下新 Anchor
- 不覆盖现有 Block
- 不污染 Current editor
- 临时资源按恢复策略处理

## Markdown managed image conversion

普通 `.md` 推荐资源布局：

```text
Timing.md
Timing.assets/img_xxx.png
```

转换候选：

```text
Timing.note/
├─ content.md
└─ assets/images/img_xxx.png
```

流程：

```text
Classify managed refs
↓
Copy assets into candidate .note
↓
Rewrite candidate Markdown refs
↓
Parse + existence validation
↓
Commit .note
↓
Switch current document
```

不做：

- 全局替换任意绝对路径
- 改写 Code Block 中的路径示例
- 删除原 `.md`
- 自动删除旧 `.assets` 目录

## 任务草案

| 步骤 | 状态 | Requirement | 验证 |
|---|---|---|---|
| 1 | completed | RES-03/05/06/07/14 | Native Note private-asset read 已基于 Note capability + Block ID + managed relative path；Rust 验证 traversal、绝对/反斜杠、cross-block、forged capability、external revision 与可创建环境下 symlink escape。 |
| 2 | completed（当前覆盖） | RES-04/13 | Runtime Resolver 已覆盖 Block private CSS / JS / Image 与 CSS `url()` → data URL；缺失资源显示诊断且不改 Current Source。`@import` / fetch / module / Worker / WASM 继续保留为后续 requirement。 |
| 3 | completed | HTML-02/REL-03 | Existing Mixed Note 可新增第二 HTML Block；save success 后才 apply，save failure 保持旧正文/Block/Dirty；NodeSelection 不再替换旧 Block。 |
| 4 | completed | RES-08 | 真实磁盘 E2E 保存两 Block + private resources，关闭后把整个 `.note` 移到新父目录再重开；相对资源继续解析且 iframe 不泄露 Host Note Path。 |
| 5 | completed | MIG-02/03/04, RES-01 | `.md → .note` 复制 managed Markdown images 到 `assets/images/`、只重写 image node、代码示例不改写；原 `.md` 与旧 `.assets` 保留。 |
| 6 | completed | all above | html 10/10、stage-one 38/38、protection 38/38、qualification 36/36、files 17/17、files:disk 14/14、desktop Rust IPC 10/10 + UI 12/12、Note Rust 21/21、Clippy、Vite build、Tauri build、diff check 通过；Matrix/STATUS/CHECKLIST 已同步。 |

## 开发约束

- 本 Slice 已在用户书面认可 Resource Architecture / Requirements Matrix / Note Format v1.2 后实施；后续 Slice 继续以 Matrix 为最终需求约束。
- 沿用当前工作区，不 checkout/stash/worktree、不自动提交。
- 每批尽量控制在 3 个生产文件。
- 所有生产行为先写失败测试并观察 RED。
- Slice 3 的外部文件监听、Deep Copy、Missing/Orphan repair 不提前实现，但对应最终需求保留在 Matrix。
