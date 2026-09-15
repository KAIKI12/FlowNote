# FlowNote 开发验收清单

**当前里程碑：第四阶段普通 Markdown 文件操作 completed（功能、自动验收与 Windows 构建）**

**当前 Gate 状态：PASS WITH PATCHES（178 项自动检查通过，用户确认实机与 Markdown Gate 通过）**

**状态值：pending / in_progress / completed**

以 [STATUS.md](./STATUS.md)为当前状态入口，以[资格规则](../flownote-markdown-qualification/markdown-editor-qualification.md)为用例和判定依据。

用户实测反馈已记录：基础 Markdown 语法基本可用，公式渲染尚未接入。本轮完成普通 Markdown 文件操作与自动磁盘验证。LaTeX / Mermaid 渲染按当前 PRD 属于 V1.5 候选。

## 第四阶段：普通 Markdown 文件操作 — completed

- [x] Windows 的新建、打开、保存、另存为、重载、关闭与重开接入实际界面。
- [x] 网页 FileReader 导入副本，下载导出保留未保存状态；取消与非法文件不会替换当前笔记。
- [x] 严格 UTF-8、BOM / CRLF、2 MiB 边界、后缀与 NUL 校验。
- [x] 保存按序执行；保存中新输入、迟到回执、卸载和旧候选均有保护及失败回归。
- [x] Windows 正文 / 目录锁、版本冲突、无覆盖提交与恢复路径；不支持的元数据明确拒绝。
- [x] 私有 DACL / OWNER / GROUP、保护标志及基础属性保留；迟到 ADS 复核和原文副本保留通过真实测试。
- [x] Gate 不绑定用户原文件，调试视图不改写未编辑内容，Mixed Note / 自动保存占位入口不返回假成功。
- [x] 文件会话 16 项、App 到磁盘 13 项、Rust 23 项、Tauri 命令 9 项、关闭事件 12 项，加既有 105 项，共 178 项通过。
- [x] 生产 / 测试共用 Tauri 注册，验证参数、主窗口及 origin 限制；测试 exe 补齐 Common Controls v6 清单。
- [x] 最终销毁前锁定源码和可视化编辑；销毁失败恢复原模式与历史，成功后保持关闭状态；3 个失败回归已转绿。
- [x] TypeScript、Rust Clippy、只读代码审查、Windows 发布构建完成。
- [x] [第四阶段报告](../flownote-markdown-qualification/markdown-files-result-2026-09-14.md)记录 R01 / R02、恢复范围和限制。
- [x] 用户于 2026-09-14 确认真实输入法、原生文件选择器及界面操作实测通过，并接受 Markdown Gate。

以上 completed 指功能与自动验收；本地图片资源、`.note`、自动保存及原生 IME 不包含在该完成结论中。

## 第三阶段：图片、复杂列表与粘贴 — completed

- [x] 既有图片 API 与工具栏，支持 HTTP(S) / 相对地址和替代文字，保留选区外内容、路径与列表归属。
- [x] 图片插入可撤销；源码、只读、组合输入和代码上下文拒绝不适用操作。
- [x] 补齐 PNG，开发路径只提供指定资源，生产构建排除图片和路由；4/4 HTTP 检查通过。
- [x] 原始样例的五层列表、双向混合嵌套、多块内容、任务和图片项主动编辑通过。
- [x] Markdown / 富文本粘贴保留结构；代码块属于原列表项；普通文本空白和 marks 保持。
- [x] 修复嵌套 Backspace、行内代码上下文与 Markdown 实体 / 转义回归。
- [x] qualification 36/36、stage-one 27/27、protection 38/38 通过，类型 / 构建 / 函数约束及审查复核通过。
- [x] [25 项资格报告](../flownote-markdown-qualification/markdown-editor-qualification-result-2026-09-13.md)和[自动证据](../flownote-markdown-qualification/results/2026-09-13-stage-three-automatic.json)已记录已验证范围与剩余项。

图片功能为地址插入，本地图片文件导入和资源持久化仍待文件模块。本阶段完成不等于完整 Gate 通过。

## 第二阶段：Markdown 内容保真保护 — completed

- [x] 正常写作页支持可视化 / 源码；保护原因可见，源码真正可编辑和导出。
- [x] 风险初始内容不先交给富文本解析器；安全回切前检查已知扩展和 Markdown 往返语义。
- [x] Frontmatter、WikiLink、公式、Mermaid、脚注、raw HTML、未知 fence / meta / directive 保留。
- [x] 粘贴与文本输入保护选区前后内容；代码中的语法示例继续按代码处理。
- [x] 源码同步标脏、回传和导出；旧编辑器通知 / 分析结果不覆盖新正文。
- [x] 源码撤销 / 重做、组合输入整体撤销、模式延迟应用及外部版本冲突处理。
- [x] 未改动部分保留 BOM / CRLF；实际文件导入拒绝非法 UTF-8，避免替换字符造成丢失。
- [x] Gate 记录真实来源；源码模式 document:null，采集当前文本框值，磁盘保存标志仍为 false。
- [x] npm run test:protection：38/38 通过，含 8 份资格样例的载入和两次往返。
- [x] npm run test:stage-one：27/27 通过；类型、生产构建、函数约束和审查复核通过。

该里程碑覆盖已实现入口的内容保护。第四阶段已补充自动磁盘关闭 / 重开，原生输入法、视觉和图片资源继续列在完整 Qualification 中。

## 第一阶段：普通 Markdown 写作 — in_progress

- [x] 标题、正文、粗斜体、删除线、链接、引用、代码和表格排版。
- [x] 有序 / 无序列表编号与缩进；Tab、Shift+Tab、Enter、Backspace。
- [x] 任务复选框可点击、可写回 Markdown，组合输入后不会一直禁用。
- [x] 代码高亮及代码块缩进 / 退回；不执行代码内容。
- [x] 表格插入、增删表体行列、跨单元格；表头明确保护。
- [x] 工具栏格式操作、链接协议校验及 Tauri 相对链接。
- [x] Ctrl+Z / Ctrl+Y，装载与相邻输入独立撤销。
- [x] 合成中文组合输入下延迟替换、不重建实例、不重复内容。
- [x] 普通 Markdown 草稿默认页、最新正文导出、首次修改即关闭保护。
- [x] Mixed Note 不走简化导出；不显示虚假的磁盘自动保存成功。
- [x] npm run test:stage-one：27/27 通过；生产构建通过，调试界面排除。
- [x] 用户反馈基础 Markdown 语法基本可用；未将概括性反馈扩展成全部专项测试通过。
- [ ] 真实浏览器检查数字、代码颜色、任务复选框与滚动布局。
- [ ] 使用用户实际中文输入法完成段落与列表输入验收。

基础功能已获得用户实测反馈；上述逐项视觉与原生输入法专项仍缺少单独记录。功能实现及自动验收为 completed，完整 Qualification 仍待实机与文件流程的 P0 验证。

## B0 基线同步 — completed

- [x] 当前产品范围采用 [PRD v0.3](<../FlowNote PRD v0.3 — V1 Baseline.md>)。
- [x] 当前格式采用 [Note Format v1.1 / Freeze Candidate](<../FlowNote Note Format v1.1 — Freeze Candidate Draft.md>)，磁盘 formatVersion 仍为 1。
- [x] 保留 Milkdown 作为待验证候选，将 Markdown Gate 放在 HTML Vertical Slice 前。
- [x] 复用已有测试包：8 份 Markdown 样例、25 项用例，其中 21 项 P0、4 项 P1。
- [x] README / STATUS 明确旧状态文档仅作历史参考。
- [x] 2026-09-10 类型与生产构建通过，19 项 DOM 集成回归通过；没有据此将完整 Gate 标为通过。

## G0 测试准备 — in_progress

- [ ] 记录 FlowNote 代码版本、依赖版本、OS、WebView、输入法。
- [x] 保留 fixtures 原件，使用内存工作副本及独立输出目录测试。
- [x] 按[图片说明](../flownote-markdown-qualification/fixtures/qualification.assets/README.md)补齐 PNG，原路径 HTTP 验证通过。
- [x] 补齐实际编辑器的 Markdown 装载与序列化读取入口。
- [x] 开发入口复用应用的 Milkdown 配置、HTML 插件、页面样式和同步链路；视觉验收待完成。
- [x] 提供原文、实际编辑视图、ProseMirror 结构 / DOM、序列化 Markdown 的采集界面。
- [x] 实现结果导出及重新装载；产品自动磁盘保存 / 重开已补齐，原生下载和选择器仍待验。
- [x] 不用测试面板中的原文备份冒充产品的不支持语法保护。
- [x] 在 [STATUS.md](./STATUS.md)及资格 / 文件报告中记录逐项证据；原生视觉 / IME 和文件交互保持 pending。

## G1 Round-trip 与不支持语法 — completed（自动检查）

- [x] R01：8 份原件经过实际 App 与 Rust 文件服务保存 / 关闭 / 重开通过，无编辑保存保持字节和修改时间。
- [x] R02：03 的 LSU 可视化单项修改及 05 / 08 局部源码修改，真实保存 / 重开通过；其他语义或字节保持。
- [x] R03：未知 fenced block 进入明确的源码保护路径。
- [x] R04：YAML frontmatter 在源码中完整保留，05 / 08 首轮失败已修复，空元数据也覆盖。
- [x] R05：Raw HTML 源码保留；实际编辑器中不产生可执行元素或自动导入 HTML Block。
- [x] R06：WikiLink / 自定义指令进入源码保护，覆盖分段输入和粘贴的转义回归。
- [x] R07（P1）：Footnote 源码保留。
- [x] R08：Mermaid / LaTeX 源码保留，覆盖公式空白、换行及数字后缀；渲染尚未实现。
- [x] 自动检查区分普通 Markdown 的语义等价与受保护源码的字面一致；完整证据表仍待填写。

## G2 列表与粘贴 — completed（编辑器自动检查）

- [x] L01–L05：普通列表、五层有序 / 无序、双向混合嵌套。
- [x] L06–L07：Tab / Shift+Tab、Enter / Backspace，包含嵌套空项和带子列表项目的分合。
- [x] L08：列表内 Bold / Link / Inline Code。
- [x] L09–L10：列表项内多段、代码、子列表，以及引用与列表。
- [x] L11：图片存在且地址、插入、缩进退回后归属正确；原生绘制仍待确认。
- [x] L12（P1）：Task List 与普通列表混合。
- [x] P01（P1）：富文本粘贴保持 Markdown 节点与上下文。
- [x] P02：纯 Markdown 粘贴嵌套列表保留层级。
- [x] P03（P1）：粘贴代码后仍属于预期列表项。
- [x] 主动编辑比较 Markdown 语义与文档结构并重新装载；第四阶段完成 R01 / R02 的自动真实文件关闭重开。

## G3 IME — pending

- [ ] I01：真实中文输入法段落编辑无丢字、重字。
- [ ] I02：真实中文输入法列表编辑无光标跳动、composition 中断或层级变化。
- [ ] 覆盖选词、快速输入、Enter、Backspace 和嵌套列表。
- [ ] 在实际桌面 / WebView 环境复核；程序化文本输入不替代 IME 验收。
- [ ] 若文件监听尚未实现，外部更新与 composition 交互标记待后续 Slice 3 验证。

## Gate 决策 — pending

- [x] 25 项用例均已记录当前结果、证据与未覆盖说明。
- [x] 已发现失败具备最小复现；修复前后使用同一用例验证。
- [x] 按[结果模板](../flownote-markdown-qualification/markdown-editor-qualification-result-template.md)记录版本、diff、问题、补丁和当前限制。
- [ ] 依据测试包作出 PASS / PASS WITH PATCHES / FAIL；不得用总分抵消 P0 数据安全失败。
- [ ] 尚有未解决的 P0 失败时，保持 HTML / .note 深度集成为 pending。
- [ ] 没有实用适配层修复方案的保真 / 语义 / IME 失败，进入替代编辑器的同套测试评估。

## 后续里程碑 — pending

- [ ] Slice 1：Markdown + HTML → 持久化 → 关闭 → 重开。
- [ ] Slice 2：图片、Block 私有 CSS / JS、相对路径与第二个 HTML Block。
- [ ] Slice 3：外部修改、IME 冲突、异常 Anchor、Missing / Orphan、失败恢复、移动、深复制。
- [ ] Format Freeze：通过格式规范中的全部冻结测试；未知版本只读、保存失败可恢复。
- [ ] 按 PRD 完成 V1 的 Read、文件树、搜索、全屏和导出验收。
