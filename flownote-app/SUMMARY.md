# FlowNote 项目总结

**更新时间**: 2026-09-10

---

## 📊 项目概览

**FlowNote** 是一个 **Markdown + HTML 混合笔记系统**，支持将 AI 生成的 HTML 内容像图片一样自然嵌入 Markdown 笔记中。

- **技术栈**: Tauri 2 + React 18 + Milkdown + TypeScript
- **当前阶段**: 原型验证 (Vertical Slice)
- **总体进度**: 25%

---

## ✅ 已完成的核心工作

### 1. 项目架构 ✅

- 清晰的模块划分（app / editor / note / html / styles）
- 编辑器 API 层（隔离 Milkdown 实现细节）
- 数据模型设计（NoteStructure, HtmlBlock）
- 状态管理（Zustand）

### 2. Milkdown 编辑器集成 ✅

- 所见即所得编辑
- IME 中文输入支持
- 内容变化监听
- 自动保存（500ms debounce）

### 3. HTML Block 基础 ✅

- 自定义 Node 定义
- Markdown 序列化/反序列化
- iframe sandbox 渲染
- 基础 UI 框架

### 4. 文档完善 ✅

- ✅ PRD v0.2（产品需求，无需更新）
- ✅ STATUS.md（详细状态跟踪）
- ✅ PROGRESS.md（开发进度）
- ✅ ARCHITECTURE.md（架构设计）
- ✅ README.md（快速开始）

---

## 🚧 进行中

- **HTML Block 插入功能** (70%)
  - API 已实现，正在修复类型错误
  
- **Slash Menu UI** (30%)
  - UI 已完成，待集成到编辑器

---

## ❌ 未完成（按优先级）

### 🔥 第一优先级（本轮 Vertical Slice）

1. 完成 HTML Block 渲染（加载实际 HTML）
2. 集成 Tauri 文件系统 API
3. 实现 .note 文件读写
4. 测试完整生命周期（保存-关闭-重开）

### 📌 第二优先级（基础功能）

5. Slash Menu 集成（`/html`, `/image`）
6. 图片支持（粘贴、拖拽、本地存储）
7. HTML Block 编辑器（双击编辑）
8. 文件树（新建、删除、重命名）
9. Inspector 面板（Outline, Block 列表）

### 🎨 第三优先级（增强功能）

10. Mermaid 图表
11. LaTeX 公式
12. CDN 资源本地化
13. HTML Theme 适配
14. 演示模式（Slide + Speaker Notes）
15. 搜索和 Tag

### 🤖 第四优先级（AI 集成）

16. AI 重新设计 HTML
17. AI 修复 HTML
18. AI 标准化
19. AI 生成 Slides

---

## 🎯 当前卡点

### 问题 1: Milkdown API 类型不匹配

**现象**: TypeScript 编译错误
- `$node` 返回类型不符
- `usePluginViewContext` 不存在

**解决方案**: 
- 简化实现，先用基础 API
- 不强求类型完美
- 后续逐步完善

### 问题 2: HTML Block 只显示占位符

**现象**: 插入后只显示 "HTML Block: html_001"

**原因**: toDOM 只生成静态 HTML，未加载实际内容

**解决方案**:
- 在 toDOM 中注入 iframe
- 从 noteStore 读取 HTML 内容
- 使用 srcdoc 渲染

---

## 📐 设计文档状态

| 文档 | 状态 | 位置 | 说明 |
|------|------|------|------|
| PRD v0.2 | ✅ 有效 | 项目根目录 | 产品需求和架构决策 |
| README.md | ✅ 已更新 | flownote-app/ | 快速开始指南 |
| STATUS.md | ✅ 最新 | flownote-app/ | 详细状态报告 |
| PROGRESS.md | ✅ 最新 | flownote-app/ | 开发进度跟踪 |
| ARCHITECTURE.md | ✅ 最新 | flownote-app/ | 架构设计文档 |
| SUMMARY.md | ✅ 最新 | flownote-app/ | 本文档 |

**无需更新**: PRD v0.2 中的核心设计仍然完全有效

---

## 🚀 下一步行动

### 立即（今天）

1. 修复 TypeScript 类型错误
2. 完成 HTML Block 实际渲染
3. 测试插入功能

### 本周

4. 集成 Tauri 文件 API
5. 实现 .note 文件读写
6. 完整生命周期测试

### 验收标准

**成功标志**:
```
1. 用户点击"插入 HTML Block"
2. 编辑器中显示实际 HTML 内容（非占位符）
3. 保存后文件系统中有对应文件
4. 关闭重开后内容完整恢复
```

**文件结构**:
```
test.note/
├── note.json
├── content.md
└── blocks/
    └── html_001/
        ├── index.html
        └── original.html
```

---

## 📚 相关文档

- **产品设计**: `../PRD v0.2 — 核心架构与需求决策.md`
- **详细状态**: `STATUS.md`
- **开发进度**: `PROGRESS.md`
- **架构设计**: `ARCHITECTURE.md`
- **快速开始**: `README.md`

---

**最后更新**: 2026-09-10 by Claude Code
