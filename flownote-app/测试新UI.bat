@echo off
chcp 65001 > nul
cls
echo.
echo ========================================
echo   FlowNote 新 UI 测试
echo ========================================
echo.
echo 🎨 新功能:
echo   ✅ 三栏布局（文件树 + 编辑器 + Inspector）
echo   ✅ 可调整宽度的分隔条
echo   ✅ 大纲自动解析
echo   ✅ 编辑器区域
echo   ✅ Inspector 三个Tab（大纲/Block/属性）
echo.
echo 正在启动 Web 版本预览...
echo 浏览器将自动打开 http://localhost:1420
echo.
echo 按 Ctrl+C 停止服务器
echo.
echo ========================================
echo.

cd /d "%~dp0"
call npm run dev
