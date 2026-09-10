# FlowNote 开发进度

**最后更新**: 2026-09-10

> 💡 详细的项目状态、设计决策、未来计划请查看 [STATUS.md](./STATUS.md)

---

## 快速概览

**当前阶段**: HTML Block Vertical Slice 实现中  
**总体进度**: 约 25%  
**本周目标**: 完成 HTML Block 完整生命周期

### ✅ 本周已完成

1. ✅ 项目架构重构（按功能模块组织）
2. ✅ Milkdown 编辑器集成（所见即所得 + IME 支持）
3. ✅ Note 数据模型设计
4. ✅ HTML Block 插件基础（自定义 Node）
5. ✅ HTML 沙箱渲染（iframe sandbox）
6. ✅ 状态管理（Zustand + AutoSaver）
7. ✅ 编辑器 API 设计

### 🚧 进行中

- HTML Block 插入功能（70%）
- Slash Menu UI（30%）
- 类型错误修复

### ⏳ 本周待完成

- [ ] 修复 TypeScript 类型错误
- [ ] 完成 HTML Block 渲染（加载实际 HTML）
- [ ] 集成 Tauri 文件系统 API
- [ ] 实现 .note 文件读写
- [ ] 测试完整的保存-关闭-重开流程

---

**阶段一：项目架构搭建（已完成）**

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
   - Markdown 序列化/反序列化 (`flownote-html` 代码块)
   - DOM 渲染（占位符版本）
   - 通过按钮插入 HTML Block

5. **HTML 沙箱渲染**
   - `HtmlSandbox.tsx` - iframe sandbox 隔离
   - 支持 JavaScript 执行
   - 安全隔离机制

6. **UI 框架**
   - 侧边栏导航
   - 编辑器视图
   - 演示视图（显示 Note 状态）
   - 响应式样式

**当前可测试：**
- ✅ Milkdown 编辑器正常工作
- ✅ HTML Block 可以插入到编辑器
- ✅ Markdown 包含 `flownote-html` 代码块
- ✅ 编辑器显示 HTML Block 占位符
- ✅ 状态管理正常工作

### 🚧 进行中

**当前任务：完成 HTML Block 的实际渲染和文件系统集成**

下一步需要实现：
1. **HTML Block NodeView 动态渲染** - 让 HTML 真正显示在 iframe 中
2. **Tauri 文件系统 API 集成** - 实现真正的文件读写
3. **.note 文件夹完整读写** - 保存和加载所有文件
4. **完整生命周期测试** - 保存 → 关闭 → 重开 → 恢复

### ⏳ 待实现

**第一阶段核心功能：**
- [x] 项目脚手架搭建
- [x] Milkdown 集成
- [x] HTML Block Node 定义
- [x] 通过按钮插入 HTML Block
- [ ] HTML Block 动态渲染（NodeView）
- [ ] Tauri 文件系统集成
- [ ] .note 文件夹读写
- [ ] Slash Menu (`/html`)
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
