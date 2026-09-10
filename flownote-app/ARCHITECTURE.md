# FlowNote 架构设计文档

**版本**: v0.1  
**更新日期**: 2026-09-10

---

## 1. 整体架构

### 1.1 技术栈

```
┌─────────────────────────────────────────┐
│           Tauri Desktop App            │
├─────────────────────────────────────────┤
│  React 18 + TypeScript (Frontend)      │
│  ├─ Milkdown (Editor)                  │
│  ├─ Zustand (State)                    │
│  └─ Vite (Build)                       │
├─────────────────────────────────────────┤
│  Rust (Backend)                        │
│  └─ Tauri API (File System, IPC)      │
└─────────────────────────────────────────┘
```

### 1.2 模块划分

```
FlowNote
├─ App Layer              # 应用层
│  └─ UI 组件、路由、布局
│
├─ Editor Layer           # 编辑器层
│  ├─ FlowNoteEditor      # 编辑器包装
│  ├─ Plugins             # 插件系统
│  │  ├─ htmlBlock        # HTML Block
│  │  ├─ slash            # Slash Menu
│  │  └─ image            # 图片
│  └─ Commands            # 编辑命令
│
├─ Note Layer             # Note 管理层
│  ├─ Data Model          # 数据模型
│  ├─ Store               # 状态管理
│  ├─ Loader              # 加载逻辑
│  └─ Saver               # 保存逻辑
│
├─ HTML Layer             # HTML 渲染层
│  ├─ Sandbox             # iframe 沙箱
│  ├─ Editor              # HTML 编辑器
│  └─ Resource Manager    # 资源管理
│
└─ Storage Layer          # 存储层
   └─ Tauri File API      # 文件系统
```

---

## 2. 数据流

### 2.1 编辑流程

```
用户输入
    ↓
Milkdown Editor
    ↓
markdownUpdated 事件
    ↓
FlowNoteEditor.onContentChange
    ↓
noteStore.updateContent
    ↓
AutoSaver (500ms debounce)
    ↓
noteSaver.saveNote
    ↓
Tauri File API
    ↓
磁盘 (.note/content.md)
```

### 2.2 HTML Block 插入流程

```
用户点击 "插入 HTML Block"
    ↓
App.handleInsertHtmlBlock
    ↓
1. 生成 ID (html_001)
2. 添加到 noteStore.htmlBlocks
3. 调用 editorRef.insertHtmlBlock(id)
    ↓
FlowNoteEditor.insertHtmlBlock
    ↓
ProseMirror Transaction
    ↓
插入 html_block Node
    ↓
Milkdown 渲染 toDOM
    ↓
显示 HTML Block
```

### 2.3 加载流程

```
FlowNote 启动
    ↓
App.useEffect
    ↓
noteLoader.loadNote("test.note")
    ↓
Tauri File API
    ↓
读取文件:
  - note.json
  - content.md
  - blocks/*.html
    ↓
解析数据:
  - metadata
  - contentMd
  - htmlBlocks Map
    ↓
noteStore.setCurrentNote
    ↓
FlowNoteEditor 初始化
    ↓
Milkdown 解析 Markdown
    ↓
遇到 ```flownote-html 代码块
    ↓
parseMarkdown → html_block Node
    ↓
toDOM → 渲染 HTML Block
    ↓
从 noteStore 获取实际 HTML
    ↓
注入到 iframe sandbox
```

---

## 3. 核心模块设计

### 3.1 FlowNoteEditor

**职责**: 封装 Milkdown，提供统一的编辑器 API

**API**:
```typescript
interface FlowNoteEditorApi {
  getMarkdown(): string;
  setMarkdown(markdown: string): void;
  insertHtmlBlock(id: string, width?: Width): void;
  insertImage(path: string, alt?: string): void;
  focus(): void;
  setMode(mode: EditorMode): void;
}
```

**设计原则**:
- 外部组件不直接操作 Milkdown
- 所有编辑操作通过 FlowNoteEditorApi
- 隔离 Milkdown 版本变化

### 3.2 Note Store

**职责**: 管理当前 Note 的状态

**数据结构**:
```typescript
interface NoteStore {
  currentNote: NoteStructure | null;
  isDirty: boolean;
  isComposing: boolean;  // IME 输入中
  
  setCurrentNote(note: NoteStructure): void;
  updateContent(markdown: string): void;
  addHtmlBlock(id: string, content: string): void;
}
```

**设计原则**:
- 单一数据源
- 不可变更新
- 响应式订阅

### 3.3 HTML Block Plugin

**组成部分**:
1. **Node Schema**: 定义 `html_block` 节点
2. **Markdown Serialization**: 
   - parseMarkdown: `flownote-html` → Node
   - toMarkdown: Node → `flownote-html`
3. **DOM Rendering**: toDOM 生成 HTML 结构
4. **Commands**: 插入、删除、更新

**数据格式**:
```markdown
# 标题

正常 Markdown...

```flownote-html
{"id":"html_001","width":"normal"}
```

继续 Markdown...
```

### 3.4 HTML Sandbox

**职责**: 安全渲染 HTML 内容

**实现**:
```tsx
<iframe
  srcDoc={htmlContent}
  sandbox="allow-scripts"
  title="HTML Block"
/>
```

**安全策略**:
- ✅ 隔离 JavaScript 执行
- ✅ 无法访问父页面
- ✅ 无法访问本地文件
- ⏳ CDN 资源检测（待实现）
- ⏳ 本地化外部资源（待实现）

### 3.5 Auto Saver

**职责**: 自动保存 Note 内容

**策略**:
```typescript
class AutoSaver {
  private delay = 500;  // ms
  
  schedule(note: NoteStructure): void;  // debounce
  flush(note: NoteStructure): void;     // 立即保存
  cancel(): void;                       // 取消定时
}
```

**使用场景**:
- Markdown 编辑 → schedule
- 手动保存 (Ctrl+S) → flush
- 关闭前 → flush

---

## 4. 文件系统设计

### 4.1 .note 文件结构

```
example.note/
├── note.json              # 元数据
├── content.md             # Markdown 内容
├── blocks/                # HTML Blocks
│   ├── html_001/
│   │   ├── index.html     # 当前版本
│   │   └── original.html  # 原始版本
│   └── html_002/
│       ├── index.html
│       └── original.html
└── assets/                # 资源文件
    ├── images/
    │   ├── image_001.png
    │   └── image_002.jpg
    └── libs/              # 本地化的 CDN 资源
        ├── echarts.min.js
        └── tailwind.css
```

### 4.2 note.json 格式

```json
{
  "version": 1,
  "title": "笔记标题",
  "type": "mixed",
  "createdAt": "2026-09-10T12:00:00Z",
  "updatedAt": "2026-09-10T13:30:00Z",
  "tags": ["技术", "AI"],
  "htmlBlocks": [
    {
      "id": "html_001",
      "width": "normal",
      "createdAt": "2026-09-10T12:30:00Z"
    }
  ]
}
```

### 4.3 保存策略

**Atomic Write**:
```
1. 写入临时文件: content.md.tmp
2. fsync 确保写入磁盘
3. 原子重命名: content.md.tmp → content.md
```

**Debounce**:
- 编辑时 500ms 防抖
- 避免频繁 I/O

**Version Guard**:
- 保存前检查 mtime
- 避免覆盖外部修改

---

## 5. 插件系统

### 5.1 插件接口

```typescript
interface FlowNotePlugin {
  name: string;
  node?: $Node;           // 自定义 Node
  view?: $View;           // NodeView
  commands?: Command[];   // 编辑命令
  keymaps?: Keymap[];    // 快捷键
}
```

### 5.2 已有插件

1. **htmlBlock**: HTML Block 支持
2. **slash**: Slash Menu (进行中)
3. **image**: 图片支持 (待实现)

### 5.3 未来插件

- **mermaid**: Mermaid 图表
- **latex**: LaTeX 公式
- **columns**: 多栏布局
- **slide**: 演示模式

---

## 6. 性能考虑

### 6.1 大文件处理

- **虚拟滚动**: 大量 HTML Blocks
- **懒加载**: iframe 内容按需加载
- **节流**: 编辑事件处理

### 6.2 内存管理

- **及时释放**: 关闭 Note 时清理 htmlBlocks Map
- **避免泄漏**: 正确清理事件监听器

### 6.3 启动优化

- **延迟加载**: 非关键插件延迟初始化
- **缓存**: Markdown 解析结果缓存

---

## 7. 安全考虑

### 7.1 HTML 渲染

- **iframe sandbox**: 隔离 JavaScript
- **CSP**: Content Security Policy (待实现)
- **DOMPurify**: HTML 净化 (待实现)

### 7.2 文件系统

- **路径验证**: 防止目录遍历攻击
- **权限检查**: Tauri 文件 API 权限

### 7.3 外部资源

- **CDN 检测**: 识别外部资源
- **本地化**: 下载到本地
- **白名单**: 允许的 CDN 列表

---

## 8. 扩展性

### 8.1 未来方向

1. **协作编辑**: CRDT 或 OT
2. **云同步**: WebDAV / S3
3. **插件市场**: 用户自定义插件
4. **AI 集成**: 内容生成、优化

### 8.2 API 稳定性

- **语义化版本**: 遵循 semver
- **向后兼容**: 保持 API 兼容性
- **弃用策略**: 提前标记废弃 API

---

## 9. 测试策略

### 9.1 单元测试

- Note 数据模型
- 文件 I/O 逻辑
- HTML 解析

### 9.2 集成测试

- 编辑器插件
- 保存加载流程
- Tauri IPC

### 9.3 E2E 测试

- 完整用户流程
- 跨平台验证

---

## 10. 技术债务

### 10.1 当前债务

1. **类型安全**: 部分 `any` 类型
2. **错误处理**: 缺少统一机制
3. **日志系统**: 缺少结构化日志
4. **性能监控**: 无性能指标

### 10.2 偿还计划

- V1: 完善类型定义
- V1.5: 添加错误处理和日志
- V2: 性能监控和优化

---

**文档维护**: 随着架构演进持续更新此文档
