# FlowNote 开发进度

## 当前状态：HTML Block Vertical Slice 实现中

### ✅ 已完成

1. **项目架构重构**
   - 按功能模块重新组织代码结构
   - 分离编辑器、Note 管理、HTML 渲染等职责
   - 清晰的 API 边界

2. **核心数据模型**
   - `noteTypes.ts` - Note 元数据、HTML Block、编辑器状态
   - `noteStore.ts` - Zustand 状态管理
   - `noteLoader.ts` - Note 加载逻辑
   - `noteSaver.ts` - 带 debounce 的自动保存

3. **编辑器基础**
   - `FlowNoteEditor.tsx` - Milkdown 包装组件
   - `editorTypes.ts` - 编辑器 API 接口定义
   - 集成 Milkdown (commonmark + gfm)
   - IME composition 监听

4. **HTML Block 插件**
   - `HtmlBlockNode.ts` - 自定义 Node 定义
   - `HtmlBlockView.tsx` - React 视图组件
   - Markdown 序列化/反序列化 (`flownote-html` 代码块)

5. **HTML 沙箱渲染**
   - `HtmlSandbox.tsx` - iframe sandbox 隔离
   - 支持 JavaScript 执行
   - 安全隔离机制

6. **UI 框架**
   - 侧边栏导航
   - 编辑器视图
   - 演示视图（显示 Note 状态）
   - 响应式样式

### 🚧 进行中

**当前任务：完成 HTML Block 的完整生命周期**

需要实现：
1. `/html` 斜杠命令 (Slash Menu)
2. 插入 HTML Block 到编辑器
3. Markdown ↔ HTML Block 双向同步
4. 保存到磁盘（`.note/blocks/html_001/index.html`）
5. 关闭重开后恢复

### ⏳ 待实现

**第一阶段核心功能：**
- [ ] Slash Menu 插件 (`/html`, `/image`)
- [ ] HTML Block 编辑器（双击编辑）
- [ ] Tauri 文件系统集成
- [ ] .note 文件夹读写
- [ ] 图片粘贴和本地存储

**第二阶段增强功能：**
- [ ] Mermaid 图表支持
- [ ] LaTeX 公式支持
- [ ] CDN 资源检测和本地化
- [ ] HTML Theme 适配
- [ ] 演示模式 (Slide + Speaker Notes)

**第三阶段 AI 集成：**
- [ ] AI 重新设计 HTML
- [ ] AI 修复 HTML
- [ ] AI 标准化

## 项目结构

```
src/
├── app/
│   └── App.tsx                    # 主应用
├── editor/
│   ├── FlowNoteEditor.tsx         # 编辑器包装组件
│   ├── editorTypes.ts             # 编辑器 API 接口
│   └── plugins/
│       └── htmlBlock/
│           ├── HtmlBlockNode.ts   # HTML Block Node 定义
│           └── HtmlBlockView.tsx  # HTML Block React 视图
├── note/
│   ├── noteTypes.ts               # 数据模型
│   ├── noteStore.ts               # 状态管理
│   ├── noteLoader.ts              # 加载逻辑
│   └── noteSaver.ts               # 保存逻辑
├── html/
│   └── HtmlSandbox.tsx            # HTML 沙箱渲染
└── styles/
    ├── global.css                 # 全局样式
    └── editor.css                 # 编辑器样式
```

## 技术栈

- **桌面框架**: Tauri 2.2
- **UI 框架**: React 18 + TypeScript
- **编辑器**: Milkdown (ProseMirror)
- **状态管理**: Zustand
- **构建工具**: Vite 6

## 启动方式

### Web 版本（快速预览）
```bash
npm run dev
```

### Tauri 桌面版
```bash
npm run tauri:dev
```

或双击：
- `启动Web版本.bat` - 仅前端
- `启动开发环境.bat` - 完整 Tauri 应用

## 下一步计划

1. 实现 Slash Menu（参考 Milkdown react-slash 示例）
2. 实现 `insertHtmlBlock` API（插入自定义 Node）
3. 集成 Tauri 文件系统 API
4. 实现 .note 文件夹完整读写
5. 测试完整的保存-关闭-重开流程

## 参考资源

- [Milkdown Examples](https://github.com/Milkdown/examples) - 官方示例
- [Markup](https://github.com/oratis/Markup) - Tauri + Milkdown 架构参考
- [Hanshi](https://github.com/7nohe/hanshi) - IME 和同步机制参考
