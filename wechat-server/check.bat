@echo off
chcp 65001 >nul
echo ============================================
echo   家长留言板(微信版) - 系统检查
echo ============================================
echo.

echo [1] Node.js:
node --version 2>nul && echo   已安装 || echo   NOT FOUND - 请安装 https://nodejs.org

echo.
echo [2] 安装目录:
set "INSTALL_DIR=%USERPROFILE%\家长留言板"
if exist "%INSTALL_DIR%" (echo   %INSTALL_DIR% -- OK) else (echo   NOT FOUND)

echo.
echo [3] 关键文件:
if exist "%INSTALL_DIR%\server.js" (echo   server.js -- OK) else (echo   server.js -- MISSING)
if exist "%INSTALL_DIR%\widget.ps1" (echo   widget.ps1 -- OK) else (echo   widget.ps1 -- MISSING)
if exist "%INSTALL_DIR%\config.json" (echo   config.json -- OK) else (echo   config.json -- MISSING)

echo.
echo [4] 端口检查:
netstat -ano | findstr :58080 >nul && echo   58080 -- 已占用(服务可能已在运行) || echo   58080 -- 空闲

echo.
echo [5] 配置内容:
if exist "%INSTALL_DIR%\config.json" (type "%INSTALL_DIR%\config.json") else (echo   无)

echo.
echo [6] 网络:
ping -n 1 api.weixin.qq.com >nul && echo   api.weixin.qq.com -- 可达 || echo   api.weixin.qq.com -- 不可达

pause
