# 启动开发环境

由于 Claude Code 无法运行长时间运行的开发服务器，请手动在终端执行：

```bash
cd flownote-app
npm run tauri:dev
```

这会启动：
1. Vite 开发服务器（前端热更新）
2. Tauri 桌面应用窗口

## 纯 Web 开发模式（不启动 Tauri）

如果只想测试前端界面，可以运行：

```bash
cd flownote-app
npm run dev
```

然后在浏览器访问 `http://localhost:1420`

## 注意事项

- 首次运行会编译 Rust 代码，可能需要几分钟
- 确保已安装 Rust 和 Tauri 依赖
- Windows 系统可能需要安装 Visual Studio C++ Build Tools
