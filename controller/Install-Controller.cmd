@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install.ps1"
if errorlevel 1 (
  echo.
  echo Installation failed. Check the error message above.
  pause
  exit /b 1
)
echo.
echo Installation complete. You can close this window.
pause
