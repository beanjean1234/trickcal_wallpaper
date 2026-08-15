@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall.ps1"
if errorlevel 1 (
  echo.
  echo Uninstallation failed. Check the error message above.
  pause
  exit /b 1
)
echo.
echo Uninstallation complete. The saved layout and image library were kept.
pause
