@echo off
echo Uninstalling ParentBoard...

taskkill /f /im wechat-board-server.exe 2>nul
taskkill /f /im powershell.exe 2>nul

set "INSTALL_DIR=%USERPROFILE%\ParentBoard"
set "DESKTOP=%USERPROFILE%\Desktop"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

if exist "%DESKTOP%\ParentBoard.lnk" del /q "%DESKTOP%\ParentBoard.lnk"
if exist "%STARTUP%\ParentBoard.lnk" del /q "%STARTUP%\ParentBoard.lnk"
if exist "%INSTALL_DIR%" rd /s /q "%INSTALL_DIR%"

echo Uninstall complete!
pause
