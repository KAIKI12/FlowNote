# FlowNote Markdown Editor Qualification Result

Editor: Milkdown 7.22.1  
Date: 2026-09-13  
Current milestone: 图片、复杂列表与粘贴的编辑器层验收 completed

2026-09-14 更新：普通 Markdown 文件操作及 R01 / R02 自动磁盘验收已完成，见[第四阶段文件报告](./markdown-files-result-2026-09-14.md)。下方 105 项为 2026-09-13 的阶段三记录，阶段四累计检查及环境见新报告。

## Final Result

**Gate: PASS WITH PATCHES。** 2026-09-14 用户明确确认真实输入法、原生文件选择器、界面操作及 Markdown Gate 实测通过；结合当前 178 项自动检查与已完成的 FlowNote 适配补丁，准许进入 HTML Block Slice 1。

- [ ] PASS
- [x] PASS WITH PATCHES
- [ ] FAIL

## Environment

- FlowNote 基底 commit：`3a8247ac43138537676125ff3b09aaa284ca071d`；本报告对应其后的未提交工作区。
- OS：Windows 11 Pro，10.0.22631，x64。
- Node.js：24.14.1；jsdom：26.1.0。
- Milkdown：7.22.1；ProseMirror model / state / view：1.25.11 / 1.4.4 / 1.42.3。
- 实机验收来源：用户在本会话明确确认通过；具体 WebView / 输入法版本未单独提供，不虚构版本或截图。自动结果中的未实测标志保留为当时运行记录。
- [自动结果 JSON](./results/2026-09-13-stage-three-automatic.json)包含环境、代码摘要、各断言结果及明确的未验证标志。

## Automated Evidence

| 检查 | 结果 | 证据入口 |
|---|---|---|
| 普通写作回归 | 27/27 | [stage-one.spec.tsx](../flownote-app/tests/stage-one.spec.tsx) |
| 内容保护回归 | 38/38 | [protection.spec.tsx](../flownote-app/tests/protection.spec.tsx) |
| 图片、复杂列表与粘贴 | 36/36 | [qualification.spec.tsx](../flownote-app/tests/qualification.spec.tsx) |
| 测试图片 HTTP 资源 | 4/4 | [check-qualification-assets.mjs](../flownote-app/tests/check-qualification-assets.mjs) |
| 类型与生产构建 | completed | `npm run build`；主包 767.27 kB，仍有体积提示 |
| 生产隔离 | completed | 不包含 Gate、调试界面、测试 PNG 或固定测试路由 |

合计 105 项自动断言。这些断言与下方 25 项资格用例为不同粒度，不按数量互相替代。DOM 测试加载实际编辑器、插件、页面样式与同步链路；几何适配只用于逻辑操作。

## Test Results

`completed` 表示所述范围的自动检查通过；R01 / R02 在 2026-09-14 补充了真实磁盘证据。完整 Gate 仍受原生视觉、IME 和原生文件交互缺口约束。

| ID | 当前状态 | 已验证内容 / 剩余项 |
|---|---|---|
| L01 | completed | 普通列表局部修改后内容、顺序和类型保持。 |
| L02 | completed | 五层无序列表最深项编辑及重载保持全部层级。 |
| L03 | completed | 五层有序列表最深项编辑及重载保持全部层级。 |
| L04 | completed | 有序→无序→有序混合列表缩进 / 退回。 |
| L05 | completed | 无序→有序→无序混合列表缩进 / 退回。 |
| L06 | completed | 上述混合层级的 Tab / Shift+Tab 路径复核。 |
| L07 | completed | 嵌套空项及含子列表项目的 Enter / Backspace；修复段落合并问题。 |
| L08 | completed | 列表内粗体、链接、行内代码保持语义。 |
| L09 | completed | 第二段、Tcl 代码和子列表保持在原父项中。 |
| L10 | completed | 引用内的混合列表编辑与重载。 |
| L11 | completed | 图片插入、选区替换、缩进退回、路径和归属；PNG HTTP 字节正确，原生绘制待查。 |
| L12 | completed | 任务勾选不改变有序 / 无序子项结构。 |
| R01 | completed | 8 份原件经实际 App 保存 / 关闭 / 重开通过，无编辑时字节及修改时间不变；见 2026-09-14 文件报告。 |
| R02 | completed | 03 只修改 LSU 的可视化编辑，以及 05 / 08 局部源码修改，经实际 Rust 文件服务保存 / 重开通过。 |
| R03 | completed | 未知 fence 进入明确的源码保护路径。 |
| R04 | completed | Frontmatter 保留，覆盖空元数据、BOM / CRLF 和 YAML 结束标记。 |
| R05 | completed | Raw HTML 作为源码保留，编辑器不执行或自动导入 HTML Block。 |
| R06 | completed | WikiLink / 指令保留，覆盖分段输入、粘贴及外部更新。 |
| R07 | completed | Footnote 源码保留。 |
| R08 | completed | Mermaid / LaTeX 源码保留；不代表渲染实现。 |
| I01 | completed | 合成输入回归通过；用户于 2026-09-14 确认真实中文输入法实测通过。 |
| I02 | completed | 合成列表与冲突保护回归通过；用户于 2026-09-14 确认真实输入法及 Markdown Gate 实测通过。 |
| P01 | completed | 富文本强调、代码、嵌套列表，以及空格 / marks / 实体回归。 |
| P02 | completed | 在 07 目标中粘贴纯 Markdown 混合列表并重载，层级不丢。 |
| P03 | completed | 代码块粘贴后属于原列表项，后续项保持独立并可重载。 |

## Required FlowNote Patches

本轮补丁已实现并复测：

1. 接通现有 `insertImage` API 和图片工具栏，保留 Markdown 地址及替代文字；代码、源码、只读与 composition 状态拒绝不适用的插入。
2. 普通 Markdown 粘贴解析列表、代码及行内格式，保留普通文本空格与当前格式；显式纯文本粘贴继续保留原字符。
3. 粘贴的代码块保持封闭结构，避免被拆成列表项中的正文。
4. 嵌套列表首段的 Backspace 在适用的同级项之间合并文本，避免多出 `<br />` 或把一次拆分保留成两段。
5. 图片 alt、路径及定义中的转义不误判为公式；选中完整行内代码时保持代码上下文。

独立只读审查发现的空白、格式、行内代码和实体解码问题均先补失败用例，再修复；复核通过。

## Markdown Diff Notes

- 项目符号、空白行、缩进和顺序编号的等价序列化允许规范化；自动比较忽略 AST 的 position / spread。
- 03 的局部编辑只改变 LSU 文本，其余 Markdown 语义与原件比较一致。
- 05 / 08 采用真正的可编辑源码模式，局部编辑之外的原文字面保持。
- 原失败示例：普通粘贴 ` gap` 吞掉首空格、行内代码粘贴 `**literal**` 变粗体、`&amp;` 被二次转义，均已修复。
- 01–08 原始 Markdown 样例未修改；仅补齐既有 L11 说明要求的 PNG。

## Remaining Verification

1. 使用实际浏览器 / WebView 检查数字、图片绘制、滚动、工具栏和源码切换。先前 Chrome 启动被自动审批拒绝，理由仅为 `blocked by policy`；本轮未重试其他启动方式。
2. 使用 Microsoft Pinyin 或用户实际输入法完成 I01 / I02，记录候选选择、快速输入、Enter、Backspace 和嵌套列表。
3. 真实保存 / 关闭 / 重开的自动磁盘验证已于 2026-09-14 完成；原生选择器、窗口关闭和 Tauri IPC 实机验收仍待补齐。本地图片文件导入和资源持久化未实现。

Tcl 源码往返通过，但 Prism 未配置其高亮；公式 / Mermaid 排版渲染仍未接入。上述未验证项不能用自动断言数量或评分抵消。

## Decision

Markdown Editor Gate 通过，继续采用 Milkdown 和已有 FlowNote 适配补丁，进入 HTML Block Slice 1。该决定依据自动证据与用户实机确认；不代表 HTML Sandbox、`.note` 或整体 V1 已验收，也不虚构未单独填写的加权分数。
