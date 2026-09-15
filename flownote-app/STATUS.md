# FlowNote 当前状态

**更新时间：2026-09-14**

**当前阶段：Markdown Gate PASS WITH PATCHES；开始 HTML Block / .note Vertical Slice 1**

**编辑器决策：继续采用 Milkdown 与已有适配补丁。2026-09-14 用户确认真实输入法、原生文件选择器、界面操作和 Markdown Gate 均通过。**

## 当前交付：真实 Markdown 文件操作

最新实机结论以用户本轮明确确认通过为准。此前 pending 与自动 JSON 中的未实测标志是历史运行范围；不伪造额外截图、WebView / 输入法版本或分数。下一步按开发指南实现 Markdown A → HTML Block → Markdown B → `.note` 保存 → 关闭 → 重开，保留原 `.md`，不提前宣称该新切片已通过。

用户最新反馈：已测试，Markdown 语法基本可用，公式等内容尚不能正确渲染。此反馈记录为基础功能的用户实测结果，不扩大为逐项视觉验收、原生 IME 专项或完整 Qualification 通过。

根据 PRD v0.3 第 35 节，LaTeX / Mermaid 渲染是 V1.5 候选；V1 及资格测试 R08 仍要求保留它们的源码。当前已安装的 math 依赖尚未接入编辑器，不能把依赖存在当成公式功能已完成。

第四阶段已接通新建、打开、保存、另存为、重载与关闭笔记；Windows 使用真实 Rust 文件服务，网页使用 FileReader 导入副本和下载导出。R01 / R02 的 App 到磁盘自动证据已补齐。接下来补原生选择器、窗口交互、视觉与真实 IME，完成 Gate 决策；LaTeX / Mermaid 渲染仍未接入。

第四阶段交付：

- 文件工具栏、文件名 / 保存状态、Ctrl+O / Ctrl+S / Ctrl+Shift+S 已接通；取消选择、保存失败和切换笔记均保留当前修改或要求明确决策。
- 无编辑保存保持原字节与修改时间；保存中新输入保留 Dirty，保存并重载复核候选，迟到 / 卸载回执不会替换当前文档。调试与 Gate 不改写原文件。
- Windows 保存使用锁定对象、版本核验、同步暂存和无覆盖移名，保留 DACL / OWNER / GROUP、支持的基础属性和创建时间；ADS、硬链接及特殊存储属性明确拒绝，清理前复核并保留需要恢复的副本。
- 16 项会话 / 入口、13 项 App → 编辑器 → Rust → 磁盘、23 项 Rust 文件、9 项 Tauri 命令和 12 项关闭事件检查通过，旧 105 项回归通过，共 178 项；类型、Rust Clippy、只读审查和 Windows 发布构建通过。
- 生产与测试共用 Tauri 命令注册。修复最终销毁期间仍可输入的风险：首次 await / destroy 前同步锁定编辑，失败恢复原模式与历史，成功保持 closing 状态。保存期间的新输入保护不变。
- 详细方法、失败复现与边界见[第四阶段报告](../flownote-markdown-qualification/markdown-files-result-2026-09-14.md)。原生选择器 / IPC / 窗口关闭、视觉和真实输入法未据此标为通过。

第三阶段交付：

- 既有 insertImage API 和图片工具栏接通，支持 HTTP(S) / 相对路径及替代文字、选区替换和独立撤销；在源码、只读、组合输入、代码块或行内代码中拒绝不适用的插入。
- 补齐 320 × 180 PNG，开发服务器在样例原路径提供，4 项 HTTP 断言验证字节、HEAD、缺失资源和路径边界；生产构建不含该图片或测试路由。
- 01–04 原样例的五层列表、双向混合嵌套、行内格式、多块列表、图片归属及局部编辑通过；07 目标中的富文本和 Markdown 粘贴通过。
- 修复嵌套列表 Backspace 多出 `<br />`、拆分项目未合并成原段落的问题，以及列表内代码块被粘贴成正文的问题。
- 普通粘贴保留空白 / marks / 行内代码，并正确解码 Markdown 实体及转义；Ctrl+Shift+V 保留原字符。审查发现的问题均补了失败用例后修复并复核。
- [25 项资格报告](../flownote-markdown-qualification/markdown-editor-qualification-result-2026-09-13.md)及[自动结果 JSON](../flownote-markdown-qualification/results/2026-09-13-stage-three-automatic.json)已归档，完整 Gate 仍为 pending。

本轮图片功能为地址插入；本地文件导入、资源复制和持久化尚未实现，开发测试资源不作为这些产品能力的证明。

第二阶段交付：

- 正常写作页提供“可视化 / 源码”切换。风险内容先识别，再决定是否交给富文本解析器；受保护文档的 getMarkdown 读取真正可编辑的源码缓冲区。
- 保护范围包含 Frontmatter（含空元数据）、WikiLink、脚注、HTML 原文、公式、Mermaid、未知 fence、fence 附加信息和自定义指令。普通 Markdown 会进行往返语义预检；无法确认安全时显示原因并进入源码模式。
- 源码输入即刻更新、标脏与回传；语法提示延后 150 ms，避免每个按键同步解析全文。支持撤销 / 重做、整次组合输入撤销、只读及外部版本冲突处理。
- 覆盖初始载入、API / props 更新、文本输入、粘贴、导出及重载；旧可视化通知与旧分析不能覆盖源码。保留未修改区域的 BOM / CRLF；测试文件采用严格 UTF-8 解码，非法字节明确拒绝。
- Gate 证据版本为 2，记录 activeEditor、mode 与 protectionReasons；源码模式的 document 为 null，DOM 采集包含当前文本框值。磁盘格式和公开编辑器 API 签名未改变。

| 工作 | 状态 | 证据 / 边界 |
|---|---|---|
| 基础排版、代码高亮、工具栏 | completed | 标题、强调、链接、引用、列表、代码和表格已接入。 |
| 列表、任务和表格编辑 | completed | Tab / Shift+Tab、Enter / Backspace、任务勾选、表格增删及末格加行通过操作检查。 |
| 撤销重做与输入保护 | completed | 包含全文装载前后独立撤销、组合输入结束后任务框恢复、同步标脏和立即关闭保护。 |
| 默认笔记与普通 Markdown 导出 | completed | 默认“项目周记”；导出读最新正文，Mixed Note 明确拒绝简化导出。 |
| 源码保护与实际导出 | completed | 05 / 08 失败样例修复；源码可修改、实际下载内容保真，组合输入开始后立即 Ctrl+S 也受保护。 |
| 图片、复杂列表与粘贴 | completed | 新增 36/36 项编辑器断言、4/4 项 HTTP 资源断言通过；图片地址和归属保持，嵌套列表与粘贴补丁复核通过。 |
| 普通 Markdown 文件操作 | completed | Windows 真实打开 / 保存 / 另存 / 重载 / 关闭重开、网页副本导入、未保存保护及恢复提示。原生交互仍待实机检查。 |
| 桌面调用链收尾 | completed（自动检查） | Tauri 分发 / 参数 / 授权 9 项、窗口事件和最终关闭锁 12 项通过；MockRuntime / 系统事件测试边界不替代实机。 |
| 自动验收 | completed | 2026-09-14：旧 105 项、文件会话 16 项、App 到磁盘 13 项、Rust 23 项、桌面 21 项，共 178 项通过；Windows 发布构建通过。 |
| 基础功能用户反馈 | completed | 用户已反馈 Markdown 语法基本可用；明确指出公式尚未正确渲染。 |
| 浏览器视觉 / 原生输入法实机验收 | pending | Chrome 调试启动及只读截图启动均被自动审批拒绝，仅返回 blocked by policy；已请求用户进行实机确认。 |

第一阶段的功能实现和自动验收完成，已有基础功能的用户实测反馈；未逐项记录的实机专项仍不标为通过。当前 27 项是[仓库操作测试](./tests/stage-one.spec.tsx)，不等于外部测试包的 25 项完整资格结论。

正常写作页面提供文件与编辑工具栏，开发用的 Markdown Gate / 调试状态只在开发构建中出现。主页面接入真实文件会话；遗留 loadNote / AutoSaver 明确拒绝尚未实现的 Note 包 / 自动保存，不再返回模拟成功。

下一阶段：完成剩余 Qualification 证据与 Gate 决策。HTML Block / .note 深度集成继续等待该门槛。

## 1. 当前基线

| 职责 | 文档 |
|---|---|
| 产品范围与 V1 验收 | [PRD v0.3](<../FlowNote PRD v0.3 — V1 Baseline.md>) |
| 持久化格式 | [Note Format v1.1 / Freeze Candidate](<../FlowNote Note Format v1.1 — Freeze Candidate Draft.md>) |
| 开源参考与后续切片 | [Development Guide v0.1](<../FlowNote Open Source Development Guide v0.1.md>) |
| Markdown Gate 用例与判定 | [现有资格测试包](../flownote-markdown-qualification/markdown-editor-qualification.md) |
| 当前任务验收 | [CHECKLIST.md](./CHECKLIST.md) |

2026-09-10 的执行决策：Markdown Editor Gate 放在 HTML Block Vertical Slice 前。继续使用 Milkdown 做资格验证，不把框架的结构表达能力等同于产品已通过验收。

格式文档的 v1.1 是修订号；磁盘版本仍为 `formatVersion: 1`。当前状态为 Freeze Candidate，不能提前标记 Final。

[SUMMARY.md](./SUMMARY.md)、[PROGRESS.md](./PROGRESS.md)、[ARCHITECTURE.md](./ARCHITECTURE.md)、[旧测试进度](./测试当前进度.md)及[PRD v0.2](<../PRD v0.2 — 核心架构与需求决策.md>)作为历史资料保留；其旧进度百分比、类型错误和开发顺序不覆盖本文件及最新基线。

## 2. 已核实的当前实现

| 项目 | 本次证据与边界 |
|---|---|
| 类型与构建 | 2026-09-14 TypeScript、Rust Clippy 和 Windows 发布构建通过；本轮涉及的源码与测试共 265 个受检函数，最大 40 个非空行、圈复杂度 10、位置参数不超过 3。788.54 kB 主 JS 仍有体积提示。 |
| 编辑器配置 | [运行时](./src/editor/editorRuntime.ts)注册 commonmark、gfm、history、prism、任务 NodeView、同步状态事件、listener、block 与现有 HTML 原型；[适配层](./src/editor/FlowNoteEditor.tsx)连接源码和可视化界面。 |
| 编辑器适配接口 | getMarkdown / setMarkdown / setMode / insertImage 已实现；[会话状态](./src/editor/editorSession.ts)管理内容、模式与冲突，[保护分析](./src/editor/markdownProtection.ts)及[桥接](./src/editor/markdownBridge.ts)负责安全载入。公开 API 签名不变。 |
| 应用同步 | 真正切换文件时重建编辑器，避免跨文件撤销；保存保持当前编辑历史；调试视图保留编辑器挂载，相同内容通知幂等，无编辑切换不标脏。 |
| IME | 合成 composition 验证了格式 / 替换保护、模式延迟应用、来源冲突、整体撤销、不重复内容及实时导出保护；真实输入法与文件监听仍未验收。 |
| Note 加载 | [文件会话](./src/files/documentSession.ts)经原生选择器与文件服务读取普通 Markdown；网页导入副本。`.note` 包加载仍未实现。 |
| Note 保存 | 普通 Markdown 经真实文件服务保存 / 另存为，失败保留内容，冲突不覆盖外部版本；网页下载导出。自动保存仍未实现。 |
| HTML 原型 | [插件](./src/editor/plugins/htmlBlock/htmlBlockPlugin.ts)仅注册 Node；[React 视图](./src/editor/plugins/htmlBlock/HtmlBlockView.tsx)未接入 NodeView。 |
| Sandbox | [HtmlSandbox](./src/html/HtmlSandbox.tsx)使用 srcdoc 和 allow-scripts；未实现默认断网及会话授权策略。 |
| 文件后端 | [Tauri 命令](./src-tauri/src/file_commands.rs)通过共用注册入口验证分发、参数、主窗口及 origin 限制；JS 仅使用选定文件的随机能力 id 保存。Windows 文件服务完成真实磁盘测试。 |
| 开发测试入口 | [MarkdownQualification](./src/editor/MarkdownQualification.tsx)已接入实际 App，可读入文件、显式装载、采集四层证据、重载及导出。仅在开发模式加载。 |
| 回归验证 | [package.json](./package.json)提供 stage-one（27）、protection（38）、qualification（36）、qualification-assets（4）、files（16）、files:disk（13）、desktop（9 + 12）；另有 Rust 文件（23）。单轮测试超时 60 秒，编译独立执行；原生布局与 IME 仍待验证。 |

本次本地安装版本：Milkdown core / commonmark / gfm 7.22.1；prosemirror-model 1.25.11、prosemirror-state 1.4.4、prosemirror-view 1.42.3；Node.js 24.14.1。正式运行时仍须记录实际 OS、WebView、输入法及代码版本。

## 3. 测试资产与判定

复用[现有测试包](../flownote-markdown-qualification/README.md)，包含 8 份 Markdown 样例、25 项用例（21 项 P0、4 项 P1）。讨论中的 18 个场景用这份更细的清单执行，不另建一套重复规范。

- 已按[结果模板](../flownote-markdown-qualification/markdown-editor-qualification-result-template.md)形成[当前 25 项报告](../flownote-markdown-qualification/markdown-editor-qualification-result-2026-09-13.md)，明确各项编辑器证据和实机 / 文件缺口；最终决策仍为 pending。
- [图片准备说明](../flownote-markdown-qualification/fixtures/qualification.assets/README.md)要求的 PNG 已补齐，开发路径响应及 L11 的结构、插入、归属检查通过；实际浏览器绘制及产品资源持久化待验收。
- 每项记录输入 Markdown、视觉结果、必要的 ProseMirror 结构 / DOM、保存后的 Markdown及重新装载结果。
- 测试使用应用实际适配层、插件、CSS 与同步链路，不能用简化的独立 Milkdown Demo 代替。
- 测试面板保留的输入副本只用于比对，不能算作产品已实现 Unsupported Markdown 保护。

P0 不通过时不继续深入绑定 HTML / .note；先记录最小复现和故障所在层，再评估适配层修复。修复后必须用原失败用例复测。无法合理修复的数据丢失、语义破坏或 IME 问题，触发候选编辑器重新评估。

最终 PASS / PASS WITH PATCHES / FAIL 及加权评分遵循测试包。CSS marker、编号风格或等价 Markdown 格式化不单独构成换内核理由；加权总分不能抵消 P0 数据安全失败。

### 首轮只读往返观察（2026-09-10）

使用实际 App、Milkdown 配置及新测试面板，在 jsdom 环境读入全部 8 份样例，采集 Markdown / ProseMirror 结构 / DOM，重新装载输出；另用 remark-parse + remark-gfm 比较忽略 position / spread 的 CommonMark / GFM AST。

- 8 份样例的 CommonMark / GFM AST 等价，重载后的编辑器结构稳定。该检查不能识别未启用的扩展语法语义。
- [05-unsupported-syntax.md](../flownote-markdown-qualification/fixtures/05-unsupported-syntax.md)：Frontmatter 的边界被序列化为 `***`，标签被改写为普通 Markdown 列表；WikiLink 的开头被添加反斜杠转义。R04 / R06 的源码保留检查失败。
- [08-roundtrip-stress.md](../flownote-markdown-qualification/fixtures/08-roundtrip-stress.md)：Frontmatter 被改写为分隔线与标题；R04 的源码保留检查失败。
- 其余 6 份通过本轮所检查项目。包含中文文本或粘贴目标的样例只验证了已有文本往返，不代表 IME 或粘贴交互通过。
- 原生浏览器启动被自动审批拒绝（返回 blocked by policy）；本轮没有视觉、浏览器原生下载、真实输入法、Tauri 磁盘保存 / 关闭重开结论。

上述首轮 Frontmatter / WikiLink 缺口已在 2026-09-13 修复。第二阶段使用相同原件复测：8 份均通过载入与两次往返，05 / 08 另验证局部源码编辑、回传及重载保持完整。产品下载测试验证 BOM / CRLF 和编辑后的实际字节；Gate 测试验证真实活动视图，未用测试面板的原文副本代替保护。

本轮 [38 项保护检查](./tests/protection.spec.tsx)及 [27 项基础检查](./tests/stage-one.spec.tsx)均通过。独立只读审查发现的公式边界、分段粘贴、外部更新、模式切换和撤销问题均补了失败用例后修复，审查复核通过。测试中的 Tcl 代码会产生 Prism 未配置该语言的提示，源码往返通过，不代表 Tcl 语法高亮已实现。

## 4. 执行顺序

| 批次 | 状态 | 目标与交付 |
|---|---|---|
| B0 基线同步 | completed | README、STATUS、CHECKLIST 指向新基线与已有测试资产。 |
| 第一阶段普通写作 | in_progress | 功能与 27 项自动检查 completed，实机视觉 / 原生输入法确认 pending。 |
| 第二阶段内容保真保护 | completed | 产品源码模式、输入与导出保护、38 项自动检查及审查复核完成；未扩展为完整 Gate 或磁盘保存结论。 |
| 第三阶段图片与列表 / 粘贴 | completed | 图片地址插入、PNG 资源、新增 36 项编辑器与 4 项 HTTP 检查、审查和逐项报告完成。 |
| 第四阶段普通文件操作 | completed | 真实文件服务与界面、R01 / R02 自动磁盘证据、保存竞争修复、权限与恢复保护及 Windows 发布构建完成。 |
| 桌面 Gate 调用链收尾 | completed（自动检查） | 共用生产命令、IPC 验证、关闭事件、最终只读锁及失败恢复通过；等待用户的原生交互 / IME 实测反馈，再进入 HTML Slice 1。 |
| G0 最小测试入口 | in_progress | 入口、测试图片及自动证据已完成；原生浏览器 / WebView 信息和验证待补齐。 |
| G1 Round-trip / 保留能力 | completed（自动检查） | R01 八份原件无编辑保存 / 关闭 / 重开、R02 混合列表和风险源码局部编辑实际保存 / 重开通过；原生文件交互单列待验。 |
| G2 编辑行为 | completed（自动检查） | L01–L12 / P01–P03 的编辑器自动断言通过；原生视觉仍待验收。 |
| G3 IME 与决策 | pending | 在实际桌面环境运行 I01 / I02，完成全部用例记录与 Gate 决策。 |

### G0 第一批代码实现 — completed

G0 最初一批产品代码为三个文件：

1. [FlowNoteEditor](./src/editor/FlowNoteEditor.tsx)：实现现有 getMarkdown / setMarkdown，稳定实例及内容通知，修复聚焦与现有 HTML 插入命令使用的上下文。
2. [MarkdownQualification](./src/editor/MarkdownQualification.tsx)：保留输入基线，显式装载，采集实际结构与输出，支持空内容、文件错误和体积限制，导出始终标记 pending / diskSaveVerified:false。
3. [App](./src/app/App.tsx)：开发入口复用现有编辑器与同步链路；离开编辑视图前同步正文，测试面板与其布局从生产构建排除。

测试入口用于获取证据，不把模拟保存标成磁盘保存成功。可以先取得编辑器往返与交互证据；真实打开 / 保存 / 关闭 / 重开尚未覆盖时，在报告中明确标记缺口。无需先完成 .note、HTML 保存或完整 Tauri 文件系统。

先记录未修补配置的结果，再最小修复并复测。G0 超过三个代码文件时继续拆批；图片补齐属于独立测试资产准备。真实 IME 的待测项不得用程序化文本输入冒充完成。

## 5. Gate 通过后的工作

按[开发指南](<../FlowNote Open Source Development Guide v0.1.md>)依次执行：

1. Slice 1：Markdown A → 显式插入 HTML → Markdown B → Save → Close → Reopen。
2. Slice 2：Markdown 图片、HTML 本地 CSS / JS、第二个 Block，验证资源归属与相对路径。
3. Slice 3：外部编辑、IME 冲突、重复 / 非法 Anchor、Missing / Orphan Block、保存失败、移动与深复制。
4. 全部格式冻结用例通过后，将 Freeze Candidate 升级为 Final；V1 的 UI、Read、全屏、搜索和导出仍需各自验收。

进入 Slice 1 时必须对齐：

- note.json 使用 formatVersion；content.md 是正文与顺序的唯一事实来源。
- Anchor 只保存稳定且唯一的 id；当前原型额外写入的 width 需要调整。
- 实现 block.json、Current、Original 和 Block 私有资源；普通编辑不覆盖 Original。
- HTML 通过显式导入和工具栏编辑；Markdown raw HTML 不自动进入可执行 Block。
- 脚本策略与网络策略分离，默认在 runtime 阻止联网；授权不随文件传播。
- 保存串行，先持久化 Block 再提交 Anchor；失败保留 Dirty State 和恢复信息。

AI、Columns、Note Slide、Speaker Notes、主题改写、CDN 自动下载均不进入当前批次。
