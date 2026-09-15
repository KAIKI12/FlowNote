# 第四阶段：普通 Markdown 文件操作验收

日期：2026-09-14。普通文件操作及后续桌面调用链的实现、自动验收、代码审查与 Windows 发布构建 **completed**。完整 Gate 等待实机反馈。

目标来自[文件流程计划](../plan/2026-09-13_21-42-21-markdown-files.md)：打开普通 Markdown，编辑、保存 / 另存为、关闭并重开，失败及并发输入不丢正文。完整 Markdown Editor Gate 仍为 **pending**，本报告不代替原生交互与真实输入法验收。

## 可用流程

- Windows 桌面版提供新建、打开、保存、另存为、重载和关闭笔记。Ctrl+O 打开，Ctrl+S 保存，Ctrl+Shift+S 另存为；未绑定文件的首次保存选择位置。
- 网页版通过 FileReader 导入副本，通过「导出 Markdown」或 Ctrl+S 下载；不会把下载标为已写回原文件。
- 切换或关闭有修改的笔记时，可取消、保存并继续、明确放弃。打开选择器取消时保留当前笔记；保存期间继续输入会保持未保存状态。
- 无编辑保存使用原文件字节；受保护源码局部编辑保留 BOM / CRLF 及未修改区域。普通可视化编辑允许语义等价的 Markdown 格式规范化。
- 开发 Gate 使用独立草稿；进入前检查未保存内容，不能把测试样例写回已绑定的用户文件。查看调试状态不会标脏未修改的文件。
- 仅接受严格 UTF-8 的 `.md` / `.markdown`，上限 2 MiB，拒绝 NUL、非法编码和不适用的 Mixed Note 保存。遗留 Note / 自动保存占位入口现在明确报未实现。

## 自动证据

| 检查 | 结果 | 入口 |
|---|---|---|
| 普通写作回归 | 27/27 | [stage-one.spec.tsx](../flownote-app/tests/stage-one.spec.tsx) |
| 内容保护回归 | 38/38 | [protection.spec.tsx](../flownote-app/tests/protection.spec.tsx) |
| 图片、列表、粘贴 | 36/36 | [qualification.spec.tsx](../flownote-app/tests/qualification.spec.tsx) |
| 图片 HTTP 资源 | 4/4 | [check-qualification-assets.mjs](../flownote-app/tests/check-qualification-assets.mjs) |
| 文件会话、网页导入、入口 | 16/16 | [files.spec.tsx](../flownote-app/tests/files.spec.tsx) |
| App → 编辑器 → Rust → 磁盘 | 13/13 | [file-disk.spec.tsx](../flownote-app/tests/file-disk.spec.tsx) |
| Rust 文件、属性、时序和并发 | 23/23 | [基础文件](../flownote-app/src-tauri/tests/markdown_files.rs)、[元数据](../flownote-app/src-tauri/tests/file_metadata.rs)、[并发](../flownote-app/src-tauri/tests/save_races.rs)、[提交时序](../flownote-app/src-tauri/src/windows_save_tests.rs) |
| Tauri 命令分发 / 参数 / 授权 | 9/9 | [desktop_commands.rs](../flownote-app/src-tauri/tests/desktop_commands.rs)；MockRuntime，实际生产命令与文件服务 |
| 窗口事件与最终关闭保护 | 12/12 | [desktop.spec.tsx](../flownote-app/tests/desktop.spec.tsx)；实际 Tauri JS API，系统事件 / 销毁使用测试边界 |
| TypeScript / Rust 静态检查 | completed | `npx tsc --noEmit`；`cargo clippy --offline --all-targets -- -D warnings` |
| Windows 发布构建 | completed | `npm run tauri -- build --no-bundle`；生成 [flownote.exe](../flownote-app/src-tauri/target/release/flownote.exe)，未运行、未打安装包 |

当前共 **178 项**自动检查，其中第四阶段原有 157 项，桌面调用链补充 21 项；与 25 项资格用例的粒度不同。每轮自动测试限时 60 秒，编译独立执行。

[最新自动结果 JSON](./results/2026-09-14-desktop-gate-automatic.json)保存逐项结果、运行范围、源码与可执行文件 SHA-256、环境和未验证标志；[157 项基线](./results/2026-09-14-stage-four-automatic.json)保留作历史证据。最新发布主 JS 为 788.54 kB（gzip 250.42 kB），存在 Vite 的包体积提示；已检查生成包不包含 Gate / 调试界面、测试图片路由或测试驱动。

磁盘集成使用实际 App、Milkdown、文件端口及生产 Rust FileStore；[测试进程桥](../flownote-app/src-tauri/tests/file_driver.rs)只替代原生选择器 / IPC 传输，所有内容读写、版本校验与提交均落到独立临时目录。它不证明原生选择器、Tauri IPC 分发或 WebView 布局已实机通过。

- R01：8 份资格原件经 App 打开，无编辑保存后字节和修改时间不变，关闭并重开后内容相同。
- R02：03 的实际可视化列表只修改 LSU，磁盘保存 / 重开后的 CommonMark / GFM 语义与预期一致；05 / 08 修改标题后，其余字节保持。
- 覆盖立即 Ctrl+S、延迟通知、保存中新输入、取消打开 / 另存、外部冲突、重载旧候选、会话卸载及 Gate 隔离。
- 桌面收尾涉及的源码与测试共检查 265 个 TS / TSX / JS 函数，最长 40 个非空行，最大圈复杂度 10，位置参数不超过 3 个；未把未修改的旧 HTML 原型计入本轮检查。

## 桌面调用链补充

生产与测试共用 [configure_app](../flownote-app/src-tauri/src/lib.rs) 的命令注册。MockRuntime 测试覆盖生产命令分发、camelCase 回执、真实磁盘保存 / 重载 / 释放、非法参数、外部版本冲突、主窗口限制、配置 origin 可访问和远程 origin 拒绝。它不创建原生窗口；原生选择器的成功 / 取消仍待实机操作。

窗口事件检查使用实际 Tauri JavaScript Window / Event API、App、默认 NativeFilePort 和 Rust FileStore。系统事件与销毁是明确的测试边界，不能据此声明操作系统真的关闭了窗口。

审查复现并修复了最终关闭竞态：发出 destroy 请求之后仍可输入的内容可能丢失。现在在首次 await / destroy 之前同步取得编辑锁；成功后保持 closing 状态，失败后释放锁并恢复原来的编辑模式与历史。源码、可视化和任务勾选的三个失败用例已转绿；普通保存期间仍允许继续输入。

测试可执行文件因缺少 Common Controls v6 清单而无法加载 TaskDialogIndirect 的问题，已通过测试目标专用 manifest 修复。发布程序继续使用原有 Tauri manifest。运行 `npm run test:desktop` 可重复这 21 项检查。

## 保存与恢复边界

[Windows 提交实现](../flownote-app/src-tauri/src/windows_save.rs)锁定父目录和正文文件，核验 SHA-256 版本，写入并同步同目录暂存文件，再通过句柄无覆盖移名。提交间隙出现外部文件时保留外部版本、原文及编辑内容恢复副本；这是一套可恢复的两步提交，不是单步原子替换。

写正文前保留 OWNER / GROUP / DACL、ACE 顺序和保护标志，并复核实际权限；保留支持的基础属性及创建时间。ADS、多个硬链接、自定义安全标签和加密 / 压缩 / 稀疏等特殊存储属性明确拒绝原位修改。

正文共享锁不能冻结全部元数据操作，因此原对象移名后、发布前再次复核，清理旧对象前也复核。若提交后发现元数据变化或不能清理，返回已保存内容及明确提示，保留原文恢复副本。已用真实临时文件验证暂存期间新增 ADS / 硬链接，以及提交后新增 ADS 的处理。

不承诺保留完整 SACL，不承诺阻止任意已有元数据句柄无限迟到的修改；未进行断电、网络盘或其他文件系统的故障注入验证。所验证环境为 Windows 11 Pro 10.0.22631 x64、Rust 1.95.0、Tauri 2.11.5。

发生保存错误时，当前正文保持在编辑器内。先核对提示中的磁盘版本或恢复路径，再决定重载或另存为；不要把错误提示中的恢复副本当作可随意清理的临时垃圾。

## 审查中修复的问题

- 检查版本后按路径覆盖存在竞争，已改为锁定对象和无覆盖提交。
- 默认暂存权限会放宽私有文件访问范围，替换会丢属性 / ADS；已增加权限保留和元数据门槛。
- 保存成功后的延迟编辑器通知会再次标脏；相同正文通知现在幂等。
- 保存并重载的迟到结果可在取消 / 卸载后重新装载文件；刷新保持串行并复核会话和候选身份。
- 调试视图会把未编辑的 Markdown 规范化并标脏；现在只同步已有用户修改。

以上问题均先复现再修复；后端与前端只读审查复核已完成，没有留下已报告的阻塞问题。

## 剩余验收与下一步

1. Tauri 命令分发与关闭保护自动检查已完成；原生文件选择器、另存覆盖确认、系统实际关闭窗口、WebView IPC 与显示仍为 pending。
2. 使用实际中文输入法完成 I01 / I02，验证候选选择、列表与源码中的连续输入、光标和撤销。
3. 复核数字、图片绘制、长文滚动与文件工具栏布局，再按[资格规则](./markdown-editor-qualification.md)形成 Gate 决策。

本轮已向用户询问实机结果，尚未收到新增反馈。按[开发顺序](<../FlowNote Open Source Development Guide v0.1.md>)，Gate 收尾后进入 HTML Block Slice 1：Markdown A → 显式 HTML → Markdown B → 保存 → 关闭 → 重开；不把未测项自动认定为通过。

先前 Chrome 启动被自动审批拒绝，原因仅返回 `blocked by policy`；本轮使用无窗口验证，没有借 Tauri GUI 绕过该限制。

公式 / Mermaid 当前保留源码，排版渲染仍未接入。本地图片资源解析 / 复制、`.note`、HTML 深度集成、文件树和自动保存仍在后续范围；图片 Markdown 地址的保留不等于资源持久化已实现。
