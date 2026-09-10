# FlowNote 项目状态报告

**更新时间**: 2026-09-10  
**当前阶段**: HTML Block Vertical Slice 实现中

---

## ✅ 已完成的工作

### 1. 项目架构搭建 (100%)

**技术栈选型完成**:
- ✅ Tauri 2.2 - 桌面框架
- ✅ React 18 + TypeScript - UI 框架
- ✅ Milkdown - Markdown 编辑器（基于 ProseMirror）
- ✅ Zustand - 状态管理
- ✅ Vite 6 - 构建工具

**项目结构重构**:
```
src/
├── app/                    ✅ 主应用
├── editor/                 ✅ 编辑器模块
│   ├── FlowNoteEditor.tsx ✅ 编辑器包装
│   ├── editorTypes.ts     ✅ API 接口定义
│   └── plugins/           
│       ├── htmlBlock/     ✅ HTML Block 插件
│       └── slash/         🚧 Slash Menu（部分完成）
├── note/                   ✅ Note 数据管理
│   ├── noteTypes.ts       ✅ 数据模型
│   ├── noteStore.ts       ✅ 状态管理
│   ├── noteLoader.ts      ✅ 加载逻辑
│   └── noteSaver.ts       ✅ 保存逻辑（debounce）
├── html/                   ✅ HTML 渲染
│   └── HtmlSandbox.tsx    ✅ iframe 沙箱
└── styles/                 ✅ 样式系统
    ├── global.css
    ├── editor.css
    └── slashmenu.css
```

### 2. 核心功能实现 (60%)

#### ✅ Note 数据模型
- **文件格式设计**: `.md` 和 `.note` 双格式体系
- **数据结构**:
  ```typescript
  interface NoteStructure {
    path: string;
    metadata: NoteMetadata;
    contentMd: string;
    htmlBlocks: Map<string, string>;
    assets: string[];
  }
  ```
- **HTML Block 引用格式**: 使用标准 Markdown 代码块
  ````markdown
  ```flownote-html
  {"id":"html_001"}
  ```
  ````

#### ✅ Milkdown 编辑器集成
- **所见即所得编辑**: commonmark + gfm
- **IME 支持**: 中文输入法保护 (compositionstart/compositionend)
- **内容监听**: markdownUpdated 事件
- **自动保存**: 500ms debounce

#### ✅ HTML Block 插件基础
- **自定义 Node 定义**: `html_block` node type
- **Markdown 序列化**: parseMarkdown / toMarkdown
- **DOM 渲染**: toDOM 生成 HTML 结构
- **属性支持**: id, width (normal/wide/full)

#### ✅ HTML 沙箱渲染
- **iframe sandbox**: `allow-scripts` 隔离
- **内容注入**: srcdoc 方式
- **安全隔离**: 无法访问父页面和本地文件

#### ✅ 状态管理
- **Zustand Store**: currentNote, isDirty, isComposing
- **自动保存**: AutoSaver 类（debounce + flush）
- **HTML Block 管理**: Map<id, htmlContent>

#### ✅ UI 框架
- **侧边栏导航**: 编辑器视图 + 演示视图
- **操作按钮**: 插入 HTML Block
- **演示视图**: 显示 Note 元数据、Content、HTML Blocks 列表
- **响应式样式**: 暗色主题

### 3. 编辑器 API 设计 (80%)

```typescript
interface FlowNoteEditorApi {
  getMarkdown(): string;              ✅ 已定义
  setMarkdown(markdown: string): void; ✅ 已定义
  insertHtmlBlock(id, width): void;   ✅ 已实现（部分）
  insertImage(path, alt): void;       ⏳ 待实现
  focus(): void;                      ✅ 已实现
  setMode(mode): void;                ⏳ 待实现
}
```

---

## 🚧 进行中的工作

### HTML Block 插入功能 (70%)

**已完成**:
- ✅ `insertHtmlBlock` API 实现
- ✅ 通过按钮触发插入
- ✅ HTML Block Node 定义
- ✅ 基础 DOM 渲染（占位符）

**遇到的问题**:
- ⚠️ Milkdown API 类型不匹配
- ⚠️ $node 和 $view 的正确用法
- ⚠️ NodeView 插件注册方式

**下一步**:
1. 修复 TypeScript 类型错误
2. 完善 HTML Block 的实际渲染（从 noteStore 加载 HTML）
3. 测试插入功能是否正常工作

### Slash Menu (30%)

**已完成**:
- ✅ Slash Menu UI 组件
- ✅ 菜单项定义（H1, H2, 分隔符, HTML, 图片, 代码）
- ✅ 键盘导航（ArrowUp, ArrowDown, Enter）
- ✅ 样式实现

**待完成**:
- ❌ 集成到 Milkdown（@milkdown/plugin-slash）
- ❌ 触发逻辑（输入 `/` 显示菜单）
- ❌ 回调函数连接（onInsertHtmlBlock）
- ❌ 菜单关闭逻辑

---

## ❌ 未实现的功能

### 第一优先级（本轮 Vertical Slice）

1. **完整的 HTML Block 生命周期**
   - [ ] 从编辑器插入 HTML Block
   - [ ] HTML Block 在编辑器中正确显示
   - [ ] 加载 noteStore 中的实际 HTML 内容并渲染到 iframe
   - [ ] 编辑 HTML Block（双击弹出编辑器）
   - [ ] Markdown 与 HTML Block 的双向同步
   - [ ] 保存到磁盘（Tauri 文件 API）
   - [ ] 关闭重开后完整恢复

2. **Slash Menu 集成**
   - [ ] `/html` 触发并插入 HTML Block
   - [ ] `/image` 触发并插入图片
   - [ ] 其他基础命令（标题、代码块等）

3. **Tauri 文件系统集成**
   - [ ] 读取 `.note/` 目录结构
   - [ ] 读取 `note.json` 元数据
   - [ ] 读取 `content.md`
   - [ ] 读取 `blocks/html_001/index.html`
   - [ ] 写入文件（atomic write）
   - [ ] 文件监听（外部修改检测）

### 第二优先级（基础功能）

4. **图片支持**
   - [ ] 图片粘贴
   - [ ] 图片拖拽
   - [ ] 保存到 `assets/images/`
   - [ ] 路径引用更新

5. **HTML Block 编辑器**
   - [ ] 双击弹出快速编辑窗口
   - [ ] HTML 源码编辑
   - [ ] 实时预览
   - [ ] 完整编辑模式（独立 Tab）

6. **文件树**
   - [ ] 显示 `.md` 和 `.note` 文件
   - [ ] 新建文件
   - [ ] 删除文件
   - [ ] 重命名文件
   - [ ] 文件夹支持

7. **Inspector 面板**
   - [ ] Outline（大纲）
   - [ ] Block 列表
   - [ ] Properties（元数据）

### 第三优先级（增强功能）

8. **Markdown 增强**
   - [ ] Mermaid 图表
   - [ ] LaTeX 公式
   - [ ] 代码高亮
   - [ ] 表格支持

9. **HTML Block 增强**
   - [ ] CDN 资源检测
   - [ ] 本地化外部资源
   - [ ] Theme 适配
   - [ ] 响应式适配

10. **演示模式**
    - [ ] Slide 分页
    - [ ] Speaker Notes
    - [ ] Presenter View
    - [ ] 全屏演示

11. **搜索和导航**
    - [ ] 全文搜索
    - [ ] Tag 系统
    - [ ] Backlinks

### 第四优先级（AI 集成）

12. **AI 功能**
    - [ ] AI 重新设计 HTML
    - [ ] AI 修复 HTML
    - [ ] AI 标准化 HTML
    - [ ] AI 生成 Slides
    - [ ] AI 从 Markdown 生成 HTML

---

## 📐 设计文档更新状态

### 已有文档

1. **PRD v0.2 — 核心架构与需求决策.md** (位于项目根目录)
   - ✅ Note 文件模型定义
   - ✅ HTML Block 独立保存设计
   - ✅ Sandbox 策略
   - ✅ CDN 本地化方案
   - ✅ V1/V1.5/V2 版本规划
   - **状态**: 无需更新，仍然有效

2. **README.md** (flownote-app/)
   - ✅ 技术栈说明
   - ✅ 验证目标
   - ✅ 安装和启动方式
   - ✅ 项目结构
   - **状态**: 已更新

3. **PROGRESS.md** (flownote-app/)
   - ✅ 开发进度跟踪
   - ✅ 项目结构说明
   - ✅ 技术栈列表
   - ✅ 下一步计划
   - **状态**: 已创建，需要更新

### 需要新增的文档

4. **ARCHITECTURE.md** - 架构设计文档
   - 数据流
   - 模块职责
   - API 设计
   - 插件机制

5. **API.md** - API 参考文档
   - FlowNoteEditor API
   - Note 管理 API
   - 文件系统 API

6. **TROUBLESHOOTING.md** - 问题排查
   - 常见问题
   - 调试技巧
   - 性能优化

---

## 🎯 下一步行动计划

### 立即修复（当前卡点）

1. **修复 TypeScript 类型错误**
   - 问题: Milkdown API 类型不匹配
   - 方案: 简化实现，先用基础 API，不强求类型完美
   - 预计时间: 30 分钟

2. **完成 HTML Block 渲染**
   - 问题: 当前只显示占位符
   - 方案: 在 toDOM 中注入实际 HTML（或使用 iframe）
   - 预计时间: 1 小时

3. **测试插入功能**
   - 验证按钮点击 → 插入 Node → 显示内容
   - 预计时间: 30 分钟

### 本周目标（Vertical Slice 完成）

**目标**: 完成一个完整的 HTML Block 生命周期

**里程碑**:
1. ✅ 架构搭建
2. 🚧 HTML Block 插入和渲染（进行中）
3. ⏳ Tauri 文件 I/O
4. ⏳ 保存和加载测试
5. ⏳ 关闭重开验证

**验收标准**:
```
用户操作流程:
1. 启动 FlowNote
2. 打开或新建一个 .note 文件
3. 写一些 Markdown
4. 点击"插入 HTML Block"按钮
5. 看到 HTML Block 在编辑器中显示
6. 保存（Ctrl+S 或自动保存）
7. 关闭 FlowNote
8. 重新打开
9. Markdown + HTML Block 完整恢复

硬盘上的文件:
test.note/
├── note.json
├── content.md
└── blocks/
    └── html_001/
        ├── index.html
        └── original.html
```

### 下周目标（基础功能补全）

1. Slash Menu 集成
2. 图片支持
3. 文件树基础功能
4. HTML Block 编辑器

---

## 🐛 已知问题

1. **TypeScript 类型错误**
   - `$node` 返回类型与预期不符
   - `usePluginViewContext` 不存在
   - 优先级: 高

2. **Milkdown 版本兼容性**
   - 可能需要调整插件 API 用法
   - 优先级: 高

3. **HTML Block 渲染**
   - 当前只显示占位符，未加载实际 HTML
   - 优先级: 高

4. **缺少 Tauri 命令**
   - 文件读写尚未实现
   - 优先级: 中

---

## 📚 参考资源

**正在使用**:
- [Milkdown Examples](https://github.com/Milkdown/examples) - 官方示例
- [Markup](https://github.com/oratis/Markup) - Tauri + Milkdown 参考
- [Hanshi](https://github.com/7nohe/hanshi) - IME 和同步参考

**待研究**:
- [DOMPurify](https://github.com/cure53/DOMPurify) - HTML 安全过滤
- [Reveal.js](https://github.com/hakimel/reveal.js) - 演示模式

---

## 💡 技术债务

1. **类型安全**: 当前有部分 `any` 类型，需要逐步完善
2. **错误处理**: 缺少统一的错误处理机制
3. **测试**: 尚未编写任何测试
4. **性能**: 未进行性能优化
5. **文档**: API 文档不完整

---

## 📈 项目进度估算

**总体进度**: 约 25%

- 基础架构: 80%
- 核心功能: 20%
- 增强功能: 0%
- AI 集成: 0%

**预计完成时间**:
- V0.1 (Vertical Slice): 本周
- V1 (MVP): 2-3 周
- V1.5 (增强): 4-5 周
- V2 (AI): 6-8 周

---

**总结**: 项目架构搭建已完成，正在实现第一个关键功能（HTML Block）。当前卡在 Milkdown API 的正确使用上，需要先修复类型错误并完成基础渲染，然后再接入 Tauri 文件系统。整体方向正确，按照 Vertical Slice 的方式逐步推进。
