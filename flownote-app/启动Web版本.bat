@echo off
chcp 65001 > nul
echo ========================================
echo   FlowNote Web 版本（仅前端预览）
echo ========================================
echo.
echo 启动后访问: http://localhost:1420
echo.
echo 按 Ctrl+C 停止服务器
echo.

cd /d "%~dp0"
call npm run dev

pause
