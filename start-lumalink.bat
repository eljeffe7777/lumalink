@echo off
cd /d "%~dp0"
title LumaLink server
if "%PORT%"=="" set PORT=3000
echo Starting LumaLink... leave this window open (you can minimize it).
if /i "%~1"=="nobrowser" goto run
rem Open your default browser at the app after giving the server 2 seconds to start
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:%PORT%'"
:run
node server.js
pause
