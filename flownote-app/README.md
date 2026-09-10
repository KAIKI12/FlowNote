# FlowNote 技术验证 Demo

FlowNote 项目的技术可行性验证原型。

## 技术栈

- **桌面框架**: Tauri 2.x
- **UI 框架**: React 18 + TypeScript
- **构建工具**: Vite 6

## 验证目标

### 1. Markdown 编辑器验证
- 所见即所得编辑体验
- 图片粘贴和本地存储
- 代码块语法高亮
- Mermaid 图表支持
- LaTeX 公式支持
- 自定义 Block 扩展能力

### 2. HTML Sandbox 验证
- iframe sandbox 隔离
- JavaScript 安全执行
- CDN 资源加载检测
- 本地 assets 路径映射
- 响应式容器适配

### 3. .note 文件模型验证
- 读取 .note 目录结构
- 解析 note.json 元数据
- 加载 content.md 和 blocks/*.html
- assets 资源路径映射
- 保存修改并更新文件

## 快速测试当前进度

### 启动应用

```bash
cd flownote-app
npm run dev
```

或双击 `启动Web版本.bat`

### 当前功能

**✅ 已实现：**
- Milkdown 所见即所得编辑
- HTML Block 插入（通过按钮）
- Markdown 包含 `flownote-html` 代码块
- HTML Block 占位符显示
- 状态管理和自动保存（模拟）

**⏳ 进行中：**
- HTML Block 实际渲染（iframe）
- Tauri 文件系统集成
- .note 文件夹读写

详细进度查看：`PROGRESS.md` 和 `测试当前进度.md`

## 快速开始 (Windows)

### 方式一：使用批处理脚本

1. **检查环境**: 双击 `检查环境.bat`
2. **启动开发环境**: 双击 `启动开发环境.bat` (完整 Tauri 桌面应用)
3. **或启动 Web 版本**: 双击 `启动Web版本.bat` (仅前端，无需编译 Rust)

### 方式二：使用命令行

## 安装依赖

```bash
npm install
```

## 开发模式

```bash
npm run tauri:dev
```

## 构建

```bash
npm run tauri:build
```

## 项目结构

```
flownote-app/
├── src/                       # React 前端代码
│   ├── components/           # UI 组件
│   │   ├── FileTree.tsx     # 文件树（左侧栏）
│   │   ├── Editor.tsx       # Markdown 编辑器（主内容区）
│   │   └── Inspector.tsx    # Inspector 面板（右侧栏）
│   ├── App.tsx              # 主应用组件（三栏布局）
│   ├── main.tsx             # 入口文件
│   └── styles.css           # 全局样式
├── src-tauri/                # Tauri Rust 后端
│   ├── src/
│   │   └── main.rs          # Rust 主程序
│   ├── Cargo.toml           # Rust 依赖配置
│   └── tauri.conf.json      # Tauri 配置
├── index.html               # HTML 入口
├── package.json             # Node.js 依赖
└── vite.config.ts           # Vite 配置
```

## UI 结构

应用采用三栏布局：

```
┌─────────────┬──────────────────────────┬─────────────┐
│  文件树     │     编辑器区域           │  Inspector  │
│  (左侧栏)   │     (主内容区)           │  (右侧栏)   │
│             │                          │             │
│  📁 Folder  │  # Markdown 内容         │  📋 大纲    │
│  📄 note.md │                          │  🧩 Block   │
│  📦 xxx.note│  [编辑/阅读/演示]        │  ⚙️ 属性    │
│             │                          │             │
└─────────────┴──────────────────────────┴─────────────┘
```

- **文件树**: 显示所有笔记文件，支持 .md 和 .note 格式
- **编辑器**: Markdown 编辑区域，支持三种模式（编辑/阅读/演示）
- **Inspector**: 大纲视图、Block 列表、属性面板

## 后续计划

1. **阶段一（当前）**: 三栏布局 UI ✅
   - ✅ 文件树组件
   - ✅ 编辑器区域
   - ✅ Inspector 面板
   - ✅ 可调整宽度的分隔条
   - ✅ 大纲视图（自动解析标题）

2. **阶段二（进行中）**: Markdown 编辑器增强
   - ⏳ 集成 Milkdown（所见即所得）
   - ⏳ 语法高亮
   - ⏳ 图片粘贴

3. **阶段三**: HTML Block 集成
   - ⏳ HTML Sandbox 渲染
   - ⏳ Block 工具栏
   - ⏳ 编辑/预览切换

4. **阶段四**: 文件系统集成
   - ⏳ 读取本地文件（Tauri API）
   - ⏳ .note 文件模型实现
   - ⏳ 保存和自动保存

5. **阶段五**: 完善功能
   - ⏳ 搜索功能
   - ⏳ 标签系统
   - ⏳ 主题切换
