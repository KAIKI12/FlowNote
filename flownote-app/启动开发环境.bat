@echo off
chcp 65001 > nul
echo ========================================
echo   FlowNote 技术验证 Demo
echo ========================================
echo.
echo 正在启动开发环境...
echo.
echo 注意：首次启动会编译 Rust 代码，需要几分钟
echo.

cd /d "%~dp0"
call npm run tauri:dev

pause
