@echo off
REM ============================================================
REM  Kavari Stores — start the server
REM  Double-click this file, or run it from a terminal.
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo   Starting Kavari Stores...
echo.

REM Prefer a real Node.js install
where node >nul 2>nul
if %ERRORLEVEL%==0 (
  node server.js
  goto :end
)

REM Otherwise use the Node runtime bundled with the desktop app
set "ELECTRON=%LOCALAPPDATA%\Programs\@abacus-aidesktop\AbacusBot.exe"
if exist "%ELECTRON%" (
  echo   Using the bundled runtime.
  set ELECTRON_RUN_AS_NODE=1
  "%ELECTRON%" server.js
  goto :end
)

echo   Node.js was not found on this computer.
echo   Install it from https://nodejs.org then run this file again.
echo.

:end
pause
