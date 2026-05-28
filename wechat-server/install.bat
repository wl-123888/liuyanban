@echo off
set "INSTALL_DIR=%USERPROFILE%\ParentBoard"
set "SRC=%~dp0"

echo ============================================
echo   Parent Message Board - Install
echo ============================================
echo.
echo Target: %INSTALL_DIR%
echo.

echo [1/3] Copying files...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

copy /Y "%SRC%wechat-board-server.exe" "%INSTALL_DIR%\" >nul 2>&1 && echo   [OK] server.exe || echo   [FAIL] server.exe
copy /Y "%SRC%server.js" "%INSTALL_DIR%\" >nul 2>&1 && echo   [OK] server.js || echo   [FAIL] server.js
copy /Y "%SRC%widget.ps1" "%INSTALL_DIR%\" >nul 2>&1 && echo   [OK] widget.ps1 || echo   [FAIL] widget.ps1
copy /Y "%SRC%launch-widget.vbs" "%INSTALL_DIR%\" >nul 2>&1 && echo   [OK] launch-widget.vbs || echo   [FAIL] launch-widget.vbs
copy /Y "%SRC%start.vbs" "%INSTALL_DIR%\" >nul 2>&1 && echo   [OK] start.vbs || echo   [FAIL] start.vbs
copy /Y "%SRC%config.json" "%INSTALL_DIR%\" >nul 2>&1 && echo   [OK] config.json || echo   [FAIL] config.json
copy /Y "%SRC%uninstall.bat" "%INSTALL_DIR%\" >nul 2>&1 && echo   [OK] uninstall.bat || echo   [FAIL] uninstall.bat
if exist "%SRC%Microsoft.Web.WebView2.WinForms.dll" copy /Y "%SRC%Microsoft.Web.WebView2.WinForms.dll" "%INSTALL_DIR%\" >nul 2>&1 && echo   [OK] WebView2.WinForms.dll || echo   [FAIL] WebView2.WinForms.dll
if exist "%SRC%Microsoft.Web.WebView2.Core.dll" copy /Y "%SRC%Microsoft.Web.WebView2.Core.dll" "%INSTALL_DIR%\" >nul 2>&1 && echo   [OK] WebView2.Core.dll || echo   [FAIL] WebView2.Core.dll

echo.
echo [2/3] Creating shortcuts...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell;$desk=[Environment]::GetFolderPath('Desktop');$sc=$ws.CreateShortcut($desk+'\ParentBoard.lnk');$sc.TargetPath='%INSTALL_DIR%\start.vbs';$sc.WorkingDirectory='%INSTALL_DIR%';$sc.Save();Write-Host '  [OK] Desktop shortcut'"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell;$su=[Environment]::GetFolderPath('Startup');$sc=$ws.CreateShortcut($su+'\ParentBoard.lnk');$sc.TargetPath='%INSTALL_DIR%\start.vbs';$sc.WorkingDirectory='%INSTALL_DIR%';$sc.Save();Write-Host '  [OK] Startup shortcut'"

echo.
echo [3/3] Done
echo.
echo ============================================
echo   Install complete!
echo   Desktop: double-click "ParentBoard"
echo   Auto-start on boot: enabled
echo ============================================
pause
