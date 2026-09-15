---
mode: plan
cwd: E:/FlowNote
task: 图片插入与复杂列表、粘贴的 Markdown Gate 验收
complexity: medium
tool: writing-plans
created_at: 2026-09-13T20:19:12+08:00
---

# 图片与列表验收实施计划

目标：接通既有图片接口和工具栏，保证图片及复杂块内容属于正确列表项，并给出对应资格用例的可复查结果。

设计：图片使用既有 Markdown image 节点，保存原始相对路径或 HTTP(S) 地址。测试 PNG 只在开发环境提供，不修改磁盘格式。粘贴先经过已有源码保护，再验证普通 Markdown 列表 / 代码的实际插入行为。每批最多修改三个文件，先复现失败再实现。

| 批次 | 状态 | 操作与验收 |
|---|---|---|
| 1 | completed | 增加 test:qualification，已复现缺失图片、未实现 API / 工具栏、嵌套列表和列表内代码粘贴。 |
| 2 | completed | 图片地址与 alt 校验、既有 API 和工具栏已实现，图片及边界测试通过。 |
| 3 | completed | PNG 与 dev 路由完成，4 项 HTTP 检查通过；生产产物确认排除测试 PNG / 路由。 |
| 4 | completed | 完成原样例主动编辑；修复 Markdown 粘贴、嵌套列表 Backspace 及粘贴空格 / marks / 行内代码回归。 |
| 5 | completed | 资格 36/36、基础 27/27、保护 38/38、资源 4/4；类型、构建、函数约束及只读审查复核通过。 |
| 6 | completed | 25 项资格报告及自动结果 JSON 已归档，README / STATUS / CHECKLIST 已同步；完整 Gate 保持 pending。 |

涉及入口：[编辑器运行时](../flownote-app/src/editor/editorRuntime.ts)、[工具栏](../flownote-app/src/editor/EditorToolbar.tsx)、[编辑命令](../flownote-app/src/editor/editorActions.ts)、[输入保护](../flownote-app/src/editor/protectedInput.ts)、[Vite 配置](../flownote-app/vite.config.ts)。

验证命令：`npm run test:qualification`、`npm run test:stage-one`、`npm run test:protection`、`npm run build`。单轮测试超时 60 秒。

边界：本轮不将 DOM 自动测试视为原生视觉 / IME 通过；先前被自动审批拒绝的浏览器启动不重试。文件复制、图片资源持久化及磁盘关闭 / 重开留在相应切片中，不用开发测试资源冒充产品文件导入。用户已授权按文档继续开发，不自动提交或操作现有 Git 工作区。
