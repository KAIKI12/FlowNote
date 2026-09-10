@echo off
chcp 65001 > nul
echo ========================================
echo   环境检查
echo ========================================
echo.

echo [1/4] 检查 Node.js...
node --version
if %errorlevel% neq 0 (
    echo ❌ Node.js 未安装
    goto :error
)
echo ✅ Node.js 已安装
echo.

echo [2/4] 检查 npm...
npm --version
if %errorlevel% neq 0 (
    echo ❌ npm 未安装
    goto :error
)
echo ✅ npm 已安装
echo.

echo [3/4] 检查 Rust...
rustc --version
if %errorlevel% neq 0 (
    echo ❌ Rust 未安装
    echo 请访问 https://www.rust-lang.org/tools/install 安装 Rust
    goto :error
)
echo ✅ Rust 已安装
echo.

echo [4/4] 检查依赖...
if not exist "node_modules" (
    echo ⚠️  依赖未安装，正在安装...
    call npm install
) else (
    echo ✅ 依赖已安装
)
echo.

echo ========================================
echo   环境检查完成！可以启动项目了
echo ========================================
echo.
echo 运行方式:
echo   1. 双击 "启动开发环境.bat" (完整 Tauri 应用)
echo   2. 双击 "启动Web版本.bat" (仅前端预览)
echo.
goto :end

:error
echo.
echo ========================================
echo   环境检查失败
echo ========================================
echo.

:end
pause
